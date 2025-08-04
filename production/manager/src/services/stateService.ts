import * as k8s from '@kubernetes/client-node';
import { ProjectConfig } from '@/types/project';
import { kubernetesLogger, logError } from '@/utils/logger';
import { projectsTotal } from '@/utils/metrics';
import YAML from 'yaml';

export class StateService {
  private k8sApi: k8s.CoreV1Api;
  private k8sAppsApi: k8s.AppsV1Api;
  private kc: k8s.KubeConfig;
  private managerNamespace: string;

  constructor() {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();
    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.k8sAppsApi = this.kc.makeApiClient(k8s.AppsV1Api);
    this.managerNamespace = process.env.KUBERNETES_NAMESPACE || 'claude-manager';
  }

  async syncStateFromKubernetes(): Promise<Map<string, ProjectConfig>> {
    kubernetesLogger.info('Starting Kubernetes state sync');
    const projects = new Map<string, ProjectConfig>();

    try {
      // Get all StatefulSets in the manager namespace that match project pattern
      const statefulSets = await this.k8sAppsApi.listNamespacedStatefulSet(this.managerNamespace);
      const projectStatefulSets = statefulSets.body.items.filter(sts => 
        sts.metadata?.name?.startsWith('project-')
      );

      kubernetesLogger.info(`Found ${projectStatefulSets.length} project StatefulSets`);

      for (const statefulSet of projectStatefulSets) {
        try {
          const projectConfig = await this.extractProjectConfigFromStatefulSet(statefulSet);
          if (projectConfig) {
            projects.set(projectConfig.id, projectConfig);
            kubernetesLogger.info(`Synced project: ${projectConfig.name}`, { 
              projectId: projectConfig.id,
              statefulSet: statefulSet.metadata!.name 
            });
          }
        } catch (error) {
          kubernetesLogger.warn(`Failed to extract config from StatefulSet ${statefulSet.metadata!.name}`, { error });
        }
      }

      // Update metrics
      projectsTotal.set(projects.size);
      
      // Store synced state in ConfigMap
      await this.saveStateToConfigMap(projects);

      kubernetesLogger.info(`Kubernetes state sync completed: ${projects.size} projects`);
      return projects;

    } catch (error) {
      logError(error, { context: 'kubernetes-state-sync' });
      throw error;
    }
  }

  private async extractProjectConfigFromStatefulSet(statefulSet: k8s.V1StatefulSet): Promise<ProjectConfig | null> {
    try {
      const statefulSetName = statefulSet.metadata!.name!;
      const shortName = statefulSetName.replace('project-', '');
      
      // Get ConfigMap for project configuration
      const configMapName = `project-${shortName}`;
      let configMap: k8s.V1ConfigMap | undefined;
      
      try {
        const configMapResponse = await this.k8sApi.readNamespacedConfigMap(configMapName, this.managerNamespace);
        configMap = configMapResponse.body;
      } catch (error) {
        kubernetesLogger.warn(`ConfigMap ${configMapName} not found`);
      }

      // Get Service for URLs
      const serviceName = `project-${shortName}-service`;
      let service: k8s.V1Service | undefined;
      
      try {
        const serviceResponse = await this.k8sApi.readNamespacedService(serviceName, this.managerNamespace);
        service = serviceResponse.body;
      } catch (error) {
        kubernetesLogger.warn(`Service ${serviceName} not found`);
      }

      const projectId = statefulSet.metadata?.labels?.['project-id'] || shortName;
      
      const projectConfig: ProjectConfig = {
        id: projectId,
        name: statefulSet.metadata?.labels?.['project-name'] || shortName,
        shortName,
        namespace: this.managerNamespace,
        gitRepository: configMap?.data?.['GIT_REPOSITORY'] || '',
        anthropicApiKey: '', // Don't expose in sync
        codeServerPassword: '', // Don't expose in sync
        sudoPassword: '', // Don't expose in sync
        status: this.determineStatefulSetStatus(statefulSet),
        gitAuth: {
          type: this.determineGitAuthType(configMap),
          token: '', // Don't expose in sync
        },
        jiraConfig: configMap?.data?.['JIRA_BASE_URL'] ? {
          baseUrl: configMap.data['JIRA_BASE_URL'],
          email: configMap.data['JIRA_EMAIL'] || '',
          apiKey: '', // Don't expose in sync
          projectKeys: (configMap.data['JIRA_PROJECT_KEYS'] || '').split(',').filter(k => k.trim())
        } : undefined,
        urls: {
          codeserver: this.buildServiceUrl(service, 8443),
          agentapi: this.buildServiceUrl(service, 3284),
          devserver: this.buildServiceUrl(service, 3000),
        },
        resources: {
          cpu: statefulSet.spec?.template?.spec?.containers?.[0]?.resources?.requests?.cpu || '1',
          memory: statefulSet.spec?.template?.spec?.containers?.[0]?.resources?.requests?.memory || '2Gi',
        },
        storage: {
          size: statefulSet.spec?.volumeClaimTemplates?.[0]?.spec?.resources?.requests?.storage || '20Gi',
          storageClass: statefulSet.spec?.volumeClaimTemplates?.[0]?.spec?.storageClassName || 'default',
        },
        createdAt: new Date(statefulSet.metadata?.creationTimestamp || Date.now()),
        updatedAt: new Date(),
      };

      return projectConfig;

    } catch (error) {
      logError(error, { context: 'extract-project-config', statefulSet: statefulSet.metadata?.name });
      return null;
    }
  }

  private determineStatefulSetStatus(statefulSet: k8s.V1StatefulSet): ProjectConfig['status'] {
    const replicas = statefulSet.status?.replicas || 0;
    const readyReplicas = statefulSet.status?.readyReplicas || 0;
    
    if (replicas === 0) return 'stopped';
    if (readyReplicas === replicas) return 'running';
    if (readyReplicas === 0) return 'error';
    return 'pending';
  }

  private determineGitAuthType(configMap?: k8s.V1ConfigMap): 'token' | 'ssh-key' | 'none' {
    if (!configMap?.data) return 'none';
    
    if (configMap.data['GIT_TOKEN']) return 'token';
    if (configMap.data['SSH_PRIVATE_KEY']) return 'ssh-key';
    return 'none';
  }

  private buildServiceUrl(service?: k8s.V1Service, port?: number): string {
    if (!service || !port) return '';
    
    const serviceName = service.metadata?.name;
    const namespace = service.metadata?.namespace;
    
    return `http://${serviceName}.${namespace}.svc.cluster.local:${port}`;
  }

  async saveProjectToConfigMap(project: ProjectConfig): Promise<void> {
    try {
      const configMapName = 'claude-manager-projects';
      
      // Get existing ConfigMap or create new one
      let configMap: k8s.V1ConfigMap;
      try {
        const response = await this.k8sApi.readNamespacedConfigMap(configMapName, this.managerNamespace);
        configMap = response.body;
      } catch (error) {
        // ConfigMap doesn't exist, create it
        configMap = {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: {
            name: configMapName,
            namespace: this.managerNamespace,
            labels: {
              'app': 'claude-manager',
              'component': 'project-state'
            }
          },
          data: {}
        };
      }

      // Update project data (exclude sensitive fields)
      const projectData = {
        ...project,
        anthropicApiKey: '', // Don't store in ConfigMap
        codeServerPassword: '',
        sudoPassword: '',
        gitAuth: {
          ...project.gitAuth,
          token: '', // Don't store in ConfigMap
        },
        jiraConfig: project.jiraConfig ? {
          ...project.jiraConfig,
          apiKey: '', // Don't store in ConfigMap
        } : undefined,
      };

      configMap.data = configMap.data || {};
      configMap.data[project.id] = JSON.stringify(projectData);

      // Save or update ConfigMap
      try {
        await this.k8sApi.replaceNamespacedConfigMap(configMapName, this.managerNamespace, configMap);
        kubernetesLogger.info(`Updated project in ConfigMap: ${project.name}`, { projectId: project.id });
      } catch (error) {
        await this.k8sApi.createNamespacedConfigMap(this.managerNamespace, configMap);
        kubernetesLogger.info(`Created project in ConfigMap: ${project.name}`, { projectId: project.id });
      }

    } catch (error) {
      logError(error, { context: 'save-project-configmap', projectId: project.id });
      throw error;
    }
  }

  async saveStateToConfigMap(projects: Map<string, ProjectConfig>): Promise<void> {
    try {
      const configMapName = 'claude-manager-projects';
      const projectsData: Record<string, string> = {};

      // Convert all projects to JSON (exclude sensitive data)
      for (const [id, project] of projects) {
        const projectData = {
          ...project,
          anthropicApiKey: '',
          codeServerPassword: '',
          sudoPassword: '',
          gitAuth: {
            ...project.gitAuth,
            token: '',
          },
          jiraConfig: project.jiraConfig ? {
            ...project.jiraConfig,
            apiKey: '',
          } : undefined,
        };
        projectsData[id] = JSON.stringify(projectData);
      }

      const configMap: k8s.V1ConfigMap = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: configMapName,
          namespace: this.managerNamespace,
          labels: {
            'app': 'claude-manager',
            'component': 'project-state'
          }
        },
        data: projectsData
      };

      try {
        await this.k8sApi.replaceNamespacedConfigMap(configMapName, this.managerNamespace, configMap);
      } catch (error) {
        await this.k8sApi.createNamespacedConfigMap(this.managerNamespace, configMap);
      }

      kubernetesLogger.info(`Saved ${projects.size} projects to ConfigMap`);

    } catch (error) {
      logError(error, { context: 'save-state-configmap' });
      throw error;
    }
  }

  async removeProjectFromConfigMap(projectId: string): Promise<void> {
    try {
      const configMapName = 'claude-manager-projects';
      
      const response = await this.k8sApi.readNamespacedConfigMap(configMapName, this.managerNamespace);
      const configMap = response.body;

      if (configMap.data && configMap.data[projectId]) {
        delete configMap.data[projectId];
        
        await this.k8sApi.replaceNamespacedConfigMap(configMapName, this.managerNamespace, configMap);
        kubernetesLogger.info(`Removed project from ConfigMap`, { projectId });
      }

    } catch (error) {
      logError(error, { context: 'remove-project-configmap', projectId });
      throw error;
    }
  }

  async getLogsFromKubernetes(projectId: string, shortName: string, lines: number = 100): Promise<string[]> {
    try {
      const statefulSetName = `project-${shortName}`;
      
      // Get pods for the StatefulSet
      const pods = await this.k8sApi.listNamespacedPod(
        this.managerNamespace,
        undefined, // pretty
        undefined, // allowWatchBookmarks
        undefined, // continue
        undefined, // fieldSelector
        `app=${statefulSetName}` // labelSelector
      );

      if (pods.body.items.length === 0) {
        kubernetesLogger.warn(`No pods found for project ${projectId} (${statefulSetName})`);
        return [];
      }

      // Get logs from the first running pod
      const pod = pods.body.items.find(p => p.status?.phase === 'Running') || pods.body.items[0];
      const podName = pod.metadata!.name!;

      const logResponse = await this.k8sApi.readNamespacedPodLog(
        podName,
        this.managerNamespace,
        undefined, // container
        undefined, // follow
        undefined, // insecureSkipTLSVerifyBackend
        undefined, // limitBytes
        undefined, // pretty
        undefined, // previous
        undefined, // sinceSeconds
        lines, // tailLines
        undefined  // timestamps
      );

      const logs = logResponse.body.split('\n').filter(line => line.trim());
      kubernetesLogger.info(`Retrieved ${logs.length} log lines for project ${projectId}`);
      
      return logs;

    } catch (error) {
      logError(error, { context: 'get-kubernetes-logs', projectId, shortName });
      return [];
    }
  }

  async exportKubernetesState(): Promise<any> {
    try {
      kubernetesLogger.info('Starting Kubernetes state export');
      
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '2.0',
        namespace: this.managerNamespace,
        manager: {} as any,
        projects: {} as Record<string, any>
      };

      // Export manager resources
      try {
        const [managerDeployment, managerServices, managerConfigMaps, managerSecrets, managerPVCs] = await Promise.all([
          this.k8sAppsApi.listNamespacedDeployment(this.managerNamespace, undefined, undefined, undefined, undefined, 'app=claude-manager'),
          this.k8sApi.listNamespacedService(this.managerNamespace, undefined, undefined, undefined, undefined, 'app=claude-manager'),
          this.k8sApi.listNamespacedConfigMap(this.managerNamespace, undefined, undefined, undefined, undefined, 'app=claude-manager'),
          this.k8sApi.listNamespacedSecret(this.managerNamespace, undefined, undefined, undefined, undefined, 'app=claude-manager'),
          this.k8sApi.listNamespacedPersistentVolumeClaim(this.managerNamespace, undefined, undefined, undefined, undefined, 'app=claude-manager')
        ]);

        // Clean sensitive data from secrets
        const cleanedSecrets = managerSecrets.body.items.map(secret => ({
          ...secret,
          data: Object.keys(secret.data || {}).reduce((acc, key) => {
            acc[key] = '[REDACTED]';
            return acc;
          }, {} as Record<string, string>)
        }));

        exportData.manager = {
          deployments: managerDeployment.body.items,
          services: managerServices.body.items,
          configMaps: managerConfigMaps.body.items,
          secrets: cleanedSecrets,
          persistentVolumeClaims: managerPVCs.body.items
        };
      } catch (error) {
        kubernetesLogger.warn('Failed to export manager resources', { error });
      }

      // Export project resources (StatefulSets)
      try {
        const [statefulSets, services, configMaps] = await Promise.all([
          this.k8sAppsApi.listNamespacedStatefulSet(this.managerNamespace, undefined, undefined, undefined, undefined, 'component=project'),
          this.k8sApi.listNamespacedService(this.managerNamespace, undefined, undefined, undefined, undefined, 'component=project'),
          this.k8sApi.listNamespacedConfigMap(this.managerNamespace, undefined, undefined, undefined, undefined, 'component=project')
        ]);

        // Group resources by project shortName
        for (const sts of statefulSets.body.items) {
          const shortName = sts.metadata?.name?.replace('project-', '');
          if (!shortName) continue;

          const projectServices = services.body.items.filter(s => 
            s.metadata?.name?.startsWith(`project-${shortName}`)
          );
          const projectConfigMaps = configMaps.body.items.filter(cm => 
            cm.metadata?.name === `project-${shortName}`
          );

          exportData.projects[shortName] = {
            statefulSet: sts,
            services: projectServices,
            configMaps: projectConfigMaps
          };
        }
      } catch (error) {
        kubernetesLogger.warn('Failed to export project resources', { error });
      }

      kubernetesLogger.info(`Exported manager and ${Object.keys(exportData.projects).length} projects`);
      
      return exportData;

    } catch (error) {
      logError(error, { context: 'export-kubernetes-state' });
      throw error;
    }
  }

  async getClusterInfo(): Promise<any> {
    try {
      const [version, nodes] = await Promise.all([
        this.k8sApi.getAPIVersions(),
        this.k8sApi.listNode()
      ]);

      return {
        version: version.body,
        nodes: nodes.body.items.map(node => ({
          name: node.metadata?.name,
          status: node.status?.conditions?.find(c => c.type === 'Ready')?.status,
          version: node.status?.nodeInfo?.kubeletVersion,
          capacity: node.status?.capacity,
          allocatable: node.status?.allocatable
        }))
      };

    } catch (error) {
      logError(error, { context: 'get-cluster-info' });
      throw error;
    }
  }
}