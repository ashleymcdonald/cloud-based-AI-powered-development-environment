import { ProjectConfig, ProjectCreateRequest, ProjectUpdateRequest, GitCredential } from '@/types/project';
import { KubernetesService } from './kubernetesService';
import { StateService } from './stateService';
import { projectLogger, logProjectOperation, logError } from '@/utils/logger';
import { projectsTotal, projectOperationsTotal } from '@/utils/metrics';
import { v4 as uuidv4 } from 'uuid';

export class ProjectService {
  private projects: Map<string, ProjectConfig> = new Map();
  private gitCredentials: Map<string, GitCredential> = new Map();
  private kubernetesService: KubernetesService;
  private stateService: StateService;

  constructor() {
    this.kubernetesService = new KubernetesService();
    this.stateService = new StateService();
    this.initializeFromKubernetes();
  }

  private async initializeFromKubernetes(): Promise<void> {
    try {
      projectLogger.info('Initializing project service from Kubernetes state');
      
      // Sync state from Kubernetes on startup
      this.projects = await this.stateService.syncStateFromKubernetes();
      
      // Update metrics
      projectsTotal.set(this.projects.size);
      
      projectLogger.info(`Initialized with ${this.projects.size} projects from Kubernetes`);
    } catch (error) {
      logError(error, { context: 'project-service-initialization' });
      throw error;
    }
  }

  async createProject(request: ProjectCreateRequest): Promise<ProjectConfig> {
    const timer = projectOperationsTotal.labels({ operation: 'create', status: 'processing' }).inc();
    logProjectOperation('create', 'pending', { name: request.name });

    // Generate project configuration
    const projectId = uuidv4();
    const shortName = request.shortName || this.extractRepoName(request.gitRepository);
    const namespace = process.env.KUBERNETES_NAMESPACE || 'claude-manager';

    // Determine git provider and auth method
    const gitProvider = this.detectGitProvider(request.gitRepository);
    const gitCredential = request.gitCredentialId 
      ? this.gitCredentials.get(request.gitCredentialId)
      : null;

    const project: ProjectConfig = {
      id: projectId,
      name: request.name,
      shortName,
      gitRepository: request.gitRepository,
      gitCredentialId: request.gitCredentialId || '',
      gitProvider,
      gitAuthMethod: gitCredential?.type || 'none',
      namespace,
      nodePortBase: this.generateNodePortBase(),
      jiraConfig: request.jiraConfig ? {
        baseUrl: request.jiraConfig.baseUrl || '',
        email: request.jiraConfig.email || '',
        apiKey: request.jiraConfig.apiKey || '',
        projectKeys: request.jiraProjectKeys || []
      } : undefined,
      anthropicApiKey: request.anthropicApiKey,
      codeServerPassword: request.codeServerPassword, // Optional - only used for local dev
      sudoPassword: request.sudoPassword,
      resources: request.resources,
      status: 'creating',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Generate access URLs
    project.urls = this.generateProjectUrls(project);

    try {
      // Create Kubernetes resources
      await this.kubernetesService.createProject(project);
      
      // Update status
      project.status = 'running';
      project.deploymentStatus = {
        phase: 'Running',
        message: 'Project created successfully',
        lastUpdated: new Date()
      };

      // Store project in memory and Kubernetes ConfigMap
      this.projects.set(projectId, project);
      await this.stateService.saveProjectToConfigMap(project);
      
      // Update metrics
      projectsTotal.set(this.projects.size);
      projectOperationsTotal.labels({ operation: 'create', status: 'success' }).inc();
      
      logProjectOperation('create', projectId, { name: project.name, status: 'success' });
      return project;

    } catch (error) {
      projectOperationsTotal.labels({ operation: 'create', status: 'error' }).inc();
      logError(error, { context: 'project-creation', projectName: project.name });
      
      project.status = 'error';
      project.deploymentStatus = {
        phase: 'Failed',
        message: `Creation failed: ${error.message}`,
        lastUpdated: new Date()
      };

      this.projects.set(projectId, project);
      await this.stateService.saveProjectToConfigMap(project);
      
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  async updateProject(projectId: string, request: ProjectUpdateRequest): Promise<ProjectConfig> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    projectOperationsTotal.labels({ operation: 'update', status: 'processing' }).inc();
    logProjectOperation('update', projectId, { name: project.name });

    // Update project configuration
    if (request.name) project.name = request.name;
    if (request.anthropicApiKey) project.anthropicApiKey = request.anthropicApiKey;
    if (request.codeServerPassword) project.codeServerPassword = request.codeServerPassword;
    if (request.sudoPassword) project.sudoPassword = request.sudoPassword;
    if (request.resources) project.resources = request.resources;
    
    if (request.jiraConfig) {
      project.jiraConfig = {
        ...project.jiraConfig,
        ...request.jiraConfig,
        projectKeys: request.jiraProjectKeys || project.jiraConfig?.projectKeys || []
      };
    }

    project.updatedAt = new Date();

    // TODO: Update Kubernetes resources if needed
    // For now, we'll just update the stored configuration

    this.projects.set(projectId, project);
    await this.stateService.saveProjectToConfigMap(project);
    
    projectOperationsTotal.labels({ operation: 'update', status: 'success' }).inc();
    logProjectOperation('update', projectId, { name: project.name, status: 'success' });
    return project;
  }

  async deleteProject(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    projectOperationsTotal.labels({ operation: 'delete', status: 'processing' }).inc();
    logProjectOperation('delete', projectId, { name: project.name });

    try {
      // Update status
      project.status = 'deleting';
      this.projects.set(projectId, project);

      // Delete Kubernetes resources
      await this.kubernetesService.deleteProject(project);

      // Remove from memory and ConfigMap
      this.projects.delete(projectId);
      await this.stateService.removeProjectFromConfigMap(projectId);
      
      // Update metrics
      projectsTotal.set(this.projects.size);
      projectOperationsTotal.labels({ operation: 'delete', status: 'success' }).inc();
      
      logProjectOperation('delete', projectId, { name: project.name, status: 'success' });

    } catch (error) {
      projectOperationsTotal.labels({ operation: 'delete', status: 'error' }).inc();
      logError(error, { context: 'project-deletion', projectId, projectName: project.name });
      
      project.status = 'error';
      project.deploymentStatus = {
        phase: 'Failed',
        message: `Deletion failed: ${error.message}`,
        lastUpdated: new Date()
      };

      this.projects.set(projectId, project);
      await this.stateService.saveProjectToConfigMap(project);
      
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  async getProject(projectId: string): Promise<ProjectConfig | undefined> {
    return this.projects.get(projectId);
  }

  async listProjects(page: number = 1, limit: number = 10, sortBy: string = 'createdAt'): Promise<{
    projects: ProjectConfig[];
    total: number;
    page: number;
    limit: number;
  }> {
    const allProjects = Array.from(this.projects.values());
    
    // Sort projects
    allProjects.sort((a, b) => {
      const aValue = a[sortBy as keyof ProjectConfig] as any;
      const bValue = b[sortBy as keyof ProjectConfig] as any;
      
      if (aValue instanceof Date && bValue instanceof Date) {
        return bValue.getTime() - aValue.getTime(); // Newest first
      }
      
      return String(aValue).localeCompare(String(bValue));
    });

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const projects = allProjects.slice(startIndex, endIndex);

    return {
      projects,
      total: allProjects.length,
      page,
      limit
    };
  }

  async refreshProjectStatus(projectId: string): Promise<ProjectConfig> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    try {
      const status = await this.kubernetesService.getProjectStatus(project);
      
      project.deploymentStatus = {
        phase: status.phase,
        message: status.message,
        lastUpdated: new Date()
      };
      
      project.status = status.ready ? 'running' : 'stopped';
      project.updatedAt = new Date();

      this.projects.set(projectId, project);
      await this.stateService.saveProjectToConfigMap(project);

      return project;
    } catch (error) {
      logError(error, { context: 'refresh-project-status', projectId, projectName: project.name });
      throw error;
    }
  }

  async getProjectLogs(projectId: string, lines: number = 100): Promise<string[]> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return await this.stateService.getLogsFromKubernetes(projectId, project.shortName, lines);
  }

  // Git Credentials Management
  async createGitCredential(credential: Omit<GitCredential, 'id' | 'createdAt' | 'updatedAt'>): Promise<GitCredential> {
    const id = uuidv4();
    const newCredential: GitCredential = {
      ...credential,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.gitCredentials.set(id, newCredential);
    // TODO: Save git credentials to ConfigMap/Secret

    projectLogger.info(`Created git credential: ${newCredential.name}`);
    return newCredential;
  }

  async listGitCredentials(): Promise<GitCredential[]> {
    return Array.from(this.gitCredentials.values());
  }

  async deleteGitCredential(credentialId: string): Promise<void> {
    const credential = this.gitCredentials.get(credentialId);
    if (!credential) {
      throw new Error(`Git credential not found: ${credentialId}`);
    }

    // Check if any projects are using this credential
    const projectsUsingCredential = Array.from(this.projects.values())
      .filter(p => p.gitCredentialId === credentialId);

    if (projectsUsingCredential.length > 0) {
      throw new Error(`Cannot delete credential: ${projectsUsingCredential.length} projects are using it`);
    }

    this.gitCredentials.delete(credentialId);
    // TODO: Remove git credential from ConfigMap/Secret

    projectLogger.info(`Deleted git credential: ${credential.name}`);
  }

  // Helper methods
  private extractRepoName(gitUrl: string): string {
    // Extract repository name from git URL
    const match = gitUrl.match(/\/([^\/]+?)(?:\.git)?$/);
    return match ? match[1].toLowerCase() : 'project';
  }

  private detectGitProvider(gitUrl: string): ProjectConfig['gitProvider'] {
    if (gitUrl.includes('github.com')) return 'github';
    if (gitUrl.includes('gitlab.com') || gitUrl.includes('gitlab.')) return 'gitlab';
    if (gitUrl.includes('bitbucket.org')) return 'bitbucket';
    return 'other';
  }

  private generateNodePortBase(): number {
    // Generate a random NodePort base between 30000 and 32000
    // Avoid conflicts by checking existing projects
    const existingBases = Array.from(this.projects.values())
      .map(p => p.nodePortBase)
      .filter(base => base !== undefined) as number[];

    let nodePortBase: number;
    do {
      nodePortBase = 30000 + Math.floor(Math.random() * 2000);
    } while (existingBases.includes(nodePortBase));

    return nodePortBase;
  }

  private generateProjectUrls(project: ProjectConfig): ProjectConfig['urls'] {
    const domain = process.env.PROJECTS_DOMAIN || 'projects.internal';
    const nodePortBase = project.nodePortBase;

    return {
      vscode: `http://${domain}/${project.shortName}/`,
      agentapi: `http://${domain}/${project.shortName}/api/`,
      devServer: nodePortBase ? `http://localhost:${nodePortBase}` : undefined
    };
  }

  // State synchronization methods
  async syncFromKubernetes(): Promise<void> {
    try {
      this.projects = await this.stateService.syncStateFromKubernetes();
      projectsTotal.set(this.projects.size);
      projectLogger.info('Synchronized state from Kubernetes');
    } catch (error) {
      logError(error, { context: 'sync-from-kubernetes' });
      throw error;
    }
  }

  async getKubernetesState(): Promise<string> {
    return await this.stateService.exportKubernetesState();
  }
}