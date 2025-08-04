import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { StateService } from './stateService';
import { kubernetesLogger, logError } from '@/utils/logger';

const execAsync = promisify(exec);

export class GitBackupService {
  private backupDir: string;
  private stateService: StateService;
  private gitRepository?: string;
  private gitBranch: string;
  private gitToken?: string;
  private gitAuthType: 'token' | 'ssh-key' | 'none';
  private sshKeyPath?: string;
  private sshConfigPath: string;

  constructor() {
    this.backupDir = process.env.BACKUP_DIR || '/app/backup';
    this.stateService = new StateService();
    this.gitRepository = process.env.BACKUP_GIT_REPOSITORY;
    this.gitBranch = process.env.BACKUP_GIT_BRANCH || 'main';
    this.gitToken = process.env.BACKUP_GIT_TOKEN;
    this.gitAuthType = this.determineAuthType();
    this.sshKeyPath = process.env.BACKUP_SSH_KEY_PATH || '/app/.ssh/id_rsa';
    this.sshConfigPath = path.join(this.backupDir, '.ssh');
  }

  private determineAuthType(): 'token' | 'ssh-key' | 'none' {
    if (process.env.BACKUP_GIT_TOKEN) return 'token';
    if (process.env.BACKUP_SSH_KEY_PATH || process.env.BACKUP_SSH_PRIVATE_KEY) return 'ssh-key';
    return 'none';
  }

  async initializeBackupRepo(): Promise<void> {
    if (!this.gitRepository) {
      kubernetesLogger.warn('No backup git repository configured');
      return;
    }

    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });

      // Setup SSH configuration if using SSH keys
      if (this.gitAuthType === 'ssh-key') {
        await this.setupSshConfiguration();
      }

      // Check if git repo is already initialized
      try {
        await this.execGitCommand('git status', { cwd: this.backupDir });
        kubernetesLogger.info('Backup repository already initialized');
        
        // Pull latest changes
        await this.pullLatestChanges();
        return;
      } catch {
        // Not a git repo, need to initialize
      }

      kubernetesLogger.info('Initializing backup git repository', { 
        repository: this.gitRepository,
        authType: this.gitAuthType,
        directory: this.backupDir 
      });

      // Clone or initialize repository
      const repoUrl = this.buildAuthenticatedUrl(this.gitRepository);
      
      try {
        await this.execGitCommand(`git clone ${repoUrl} .`, { cwd: this.backupDir });
        kubernetesLogger.info('Cloned existing backup repository');
      } catch (error) {
        // Repository might not exist, initialize new one
        await this.execGitCommand('git init', { cwd: this.backupDir });
        await this.execGitCommand(`git remote add origin ${repoUrl}`, { cwd: this.backupDir });
        await this.execGitCommand(`git checkout -b ${this.gitBranch}`, { cwd: this.backupDir });
        kubernetesLogger.info('Initialized new backup repository');
      }

      // Configure git user
      await this.execGitCommand('git config user.name "Claude Manager"', { cwd: this.backupDir });
      await this.execGitCommand('git config user.email "claude-manager@cluster.local"', { cwd: this.backupDir });

    } catch (error) {
      logError(error, { context: 'initialize-backup-repo' });
      throw error;
    }
  }

  private async setupSshConfiguration(): Promise<void> {
    try {
      // Create SSH directory
      await fs.mkdir(this.sshConfigPath, { recursive: true });

      // Setup SSH key from environment variable or file
      const sshPrivateKey = process.env.BACKUP_SSH_PRIVATE_KEY;
      const sshPublicKey = process.env.BACKUP_SSH_PUBLIC_KEY;
      
      if (sshPrivateKey) {
        // SSH key provided as environment variable
        const privateKeyPath = path.join(this.sshConfigPath, 'id_rsa');
        const publicKeyPath = path.join(this.sshConfigPath, 'id_rsa.pub');
        
        await fs.writeFile(privateKeyPath, sshPrivateKey.replace(/\\n/g, '\n'), { mode: 0o600 });
        
        if (sshPublicKey) {
          await fs.writeFile(publicKeyPath, sshPublicKey.replace(/\\n/g, '\n'), { mode: 0o644 });
        }
        
        this.sshKeyPath = privateKeyPath;
        kubernetesLogger.info('SSH key configured from environment variable');
        
      } else if (this.sshKeyPath && await this.fileExists(this.sshKeyPath)) {
        // SSH key provided as file path
        kubernetesLogger.info('Using SSH key from file path', { path: this.sshKeyPath });
        
      } else {
        throw new Error('SSH key not found in environment variable or file path');
      }

      // Create SSH config file
      const gitHost = this.extractGitHost(this.gitRepository!);
      const sshConfig = `
Host ${gitHost}
  HostName ${gitHost}
  User git
  IdentityFile ${this.sshKeyPath}
  IdentitiesOnly yes
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
`;

      await fs.writeFile(path.join(this.sshConfigPath, 'config'), sshConfig.trim(), { mode: 0o600 });
      
      // Set SSH environment variables
      process.env.HOME = this.backupDir;
      process.env.SSH_AUTH_SOCK = '';
      
      kubernetesLogger.info('SSH configuration completed', { host: gitHost });

    } catch (error) {
      logError(error, { context: 'setup-ssh-configuration' });
      throw error;
    }
  }

  private extractGitHost(repository: string): string {
    try {
      if (repository.startsWith('git@')) {
        // SSH format: git@github.com:user/repo.git
        const match = repository.match(/git@([^:]+):/);
        return match ? match[1] : 'github.com';
      } else {
        // HTTPS format: https://github.com/user/repo.git
        const url = new URL(repository);
        return url.hostname;
      }
    } catch {
      return 'github.com'; // fallback
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private buildAuthenticatedUrl(repository: string): string {
    // For SSH keys, return the repository as-is (SSH format)
    if (this.gitAuthType === 'ssh-key') {
      // Convert HTTPS to SSH format if needed
      if (repository.startsWith('https://')) {
        const url = new URL(repository);
        const pathParts = url.pathname.split('/').filter(p => p);
        if (pathParts.length >= 2) {
          const owner = pathParts[0];
          const repo = pathParts[1].replace('.git', '');
          return `git@${url.hostname}:${owner}/${repo}.git`;
        }
      }
      return repository;
    }

    // For tokens, build authenticated HTTPS URL
    if (this.gitAuthType === 'token' && this.gitToken) {
      if (repository.startsWith('https://github.com/')) {
        return repository.replace('https://github.com/', `https://${this.gitToken}@github.com/`);
      } else if (repository.startsWith('https://gitlab.com/')) {
        return repository.replace('https://gitlab.com/', `https://oauth2:${this.gitToken}@gitlab.com/`);
      } else if (repository.includes('bitbucket.org')) {
        return repository.replace('https://bitbucket.org/', `https://x-token-auth:${this.gitToken}@bitbucket.org/`);
      }
    }

    return repository;
  }

  private async execGitCommand(command: string, options: any = {}): Promise<any> {
    const env = { ...process.env };
    
    if (this.gitAuthType === 'ssh-key') {
      env.GIT_SSH_COMMAND = `ssh -F ${path.join(this.sshConfigPath, 'config')} -o StrictHostKeyChecking=no`;
      env.HOME = this.backupDir;
    }

    return await execAsync(command, { ...options, env });
  }

  async pullLatestChanges(): Promise<void> {
    if (!this.gitRepository) return;

    try {
      await this.execGitCommand(`git pull origin ${this.gitBranch}`, { cwd: this.backupDir });
      kubernetesLogger.info('Pulled latest backup changes');
    } catch (error) {
      kubernetesLogger.warn('Failed to pull latest changes', { error });
      // Continue anyway - might be first push
    }
  }

  async backupKubernetesState(): Promise<string> {
    try {
      kubernetesLogger.info('Starting Kubernetes state backup');

      // Export current Kubernetes state
      const exportData = await this.stateService.exportKubernetesState();
      const clusterInfo = await this.stateService.getClusterInfo();
      
      // Format for backup with proper structure
      const backupData = this.formatExportForBackup(exportData, clusterInfo);

      // Prepare backup files
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Write individual project files and main structure
      const fileCount = await this.writeBackupStructure(backupData, timestamp);

      kubernetesLogger.info('Backup files written to disk', { 
        fileCount,
        timestamp
      });

      // Commit to git if configured
      if (this.gitRepository) {
        await this.commitAndPushBackup(timestamp);
      }

      return timestamp;

    } catch (error) {
      logError(error, { context: 'backup-kubernetes-state' });
      throw error;
    }
  }

  private async commitAndPushBackup(timestamp: string): Promise<void> {
    try {
      // Add all files
      await this.execGitCommand('git add .', { cwd: this.backupDir });

      // Check if there are changes to commit
      try {
        await this.execGitCommand('git diff --cached --exit-code', { cwd: this.backupDir });
        kubernetesLogger.info('No changes to backup');
        return;
      } catch {
        // There are changes to commit
      }

      // Commit changes
      const commitMessage = `Backup Kubernetes state - ${timestamp}

- Exported all project namespaces
- Included cluster information
- Automated backup by Claude Manager`;

      await this.execGitCommand(`git commit -m "${commitMessage}"`, { cwd: this.backupDir });
      kubernetesLogger.info('Committed backup changes');

      // Push to remote
      await this.execGitCommand(`git push origin ${this.gitBranch}`, { cwd: this.backupDir });
      kubernetesLogger.info('Pushed backup to remote repository');

    } catch (error) {
      logError(error, { context: 'commit-backup' });
      throw error;
    }
  }

  async restoreFromBackup(backupTimestamp?: string): Promise<void> {
    try {
      if (!this.gitRepository) {
        throw new Error('No backup git repository configured for restore');
      }

      kubernetesLogger.info('Starting restore from backup', { backupTimestamp });

      // Pull latest backup
      await this.pullLatestChanges();

      // Determine which backup file to use
      const backupFile = backupTimestamp 
        ? `kubernetes-state-${backupTimestamp}.yaml`
        : 'latest-kubernetes-state.yaml';

      const backupPath = path.join(this.backupDir, backupFile);

      // Check if backup file exists
      try {
        await fs.access(backupPath);
      } catch {
        throw new Error(`Backup file not found: ${backupFile}`);
      }

      kubernetesLogger.warn('Restore functionality not yet implemented', {
        backupFile,
        note: 'Would apply YAML manifests back to cluster'
      });

      // TODO: Implement actual restore logic
      // This would involve:
      // 1. Parsing the YAML backup file
      // 2. Filtering out read-only fields
      // 3. Applying resources back to the cluster
      // 4. Validating deployments come back up

    } catch (error) {
      logError(error, { context: 'restore-from-backup', backupTimestamp });
      throw error;
    }
  }

  async listAvailableBackups(): Promise<any[]> {
    try {
      if (!this.gitRepository) {
        kubernetesLogger.warn('No backup git repository configured');
        return [];
      }

      await this.pullLatestChanges();

      // Read backup directory
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter(f => f.startsWith('kubernetes-state-') && f.endsWith('.yaml'));

      const backups = [];
      for (const file of backupFiles) {
        const timestamp = file.replace('kubernetes-state-', '').replace('.yaml', '');
        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);

        backups.push({
          timestamp,
          file,
          size: stats.size,
          created: stats.mtime,
        });
      }

      // Sort by creation time (newest first)
      backups.sort((a, b) => b.created.getTime() - a.created.getTime());

      kubernetesLogger.info(`Found ${backups.length} available backups`);
      return backups;

    } catch (error) {
      logError(error, { context: 'list-available-backups' });
      return [];
    }
  }

  async scheduleAutomaticBackups(): Promise<void> {
    const backupInterval = process.env.BACKUP_INTERVAL_HOURS || '24';
    const intervalMs = parseInt(backupInterval) * 60 * 60 * 1000;

    kubernetesLogger.info(`Scheduling automatic backups every ${backupInterval} hours`);

    // Initial backup
    setTimeout(async () => {
      try {
        await this.backupKubernetesState();
      } catch (error) {
        kubernetesLogger.error('Scheduled backup failed', { error });
      }
    }, 60000); // First backup after 1 minute

    // Recurring backups
    setInterval(async () => {
      try {
        await this.backupKubernetesState();
      } catch (error) {
        kubernetesLogger.error('Scheduled backup failed', { error });
      }
    }, intervalMs);
  }

  async getBackupStatus(): Promise<any> {
    try {
      const backups = await this.listAvailableBackups();
      const manifest = await this.getBackupManifest();

      return {
        configured: !!this.gitRepository,
        repository: this.gitRepository,
        branch: this.gitBranch,
        backupCount: backups.length,
        latestBackup: backups[0] || null,
        lastManifest: manifest,
        nextScheduledBackup: this.getNextBackupTime(),
      };

    } catch (error) {
      logError(error, { context: 'get-backup-status' });
      return {
        configured: false,
        error: error.message
      };
    }
  }

  private async getBackupManifest(): Promise<any> {
    try {
      const manifestPath = path.join(this.backupDir, 'backup-manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      return JSON.parse(manifestContent);
    } catch {
      return null;
    }
  }

  private getNextBackupTime(): Date {
    const backupInterval = process.env.BACKUP_INTERVAL_HOURS || '24';
    const intervalMs = parseInt(backupInterval) * 60 * 60 * 1000;
    return new Date(Date.now() + intervalMs);
  }

  private formatExportForBackup(exportData: any, clusterInfo?: any): any {
    return {
      ...exportData,
      clusterInfo,
      backupVersion: '2.0',
      structure: 'kustomize-overlays'
    };
  }

  private async writeBackupStructure(backupData: any, timestamp: string): Promise<number> {
    let fileCount = 0;

    try {
      // Create base directory structure
      await fs.mkdir(path.join(this.backupDir, 'manager'), { recursive: true });
      await fs.mkdir(path.join(this.backupDir, 'projects'), { recursive: true });

      // Write manager resources
      if (backupData.manager) {
        const managerPath = path.join(this.backupDir, 'manager');
        
        // Write individual resource files
        if (backupData.manager.deployments?.length > 0) {
          await fs.writeFile(
            path.join(managerPath, 'deployment.yaml'),
            YAML.stringify(backupData.manager.deployments[0]),
            'utf8'
          );
          fileCount++;
        }

        if (backupData.manager.services?.length > 0) {
          await fs.writeFile(
            path.join(managerPath, 'service.yaml'),
            YAML.stringify(backupData.manager.services),
            'utf8'
          );
          fileCount++;
        }

        if (backupData.manager.configMaps?.length > 0) {
          await fs.writeFile(
            path.join(managerPath, 'configmap.yaml'),
            YAML.stringify(backupData.manager.configMaps),
            'utf8'
          );
          fileCount++;
        }

        if (backupData.manager.persistentVolumeClaims?.length > 0) {
          await fs.writeFile(
            path.join(managerPath, 'pvc.yaml'),
            YAML.stringify(backupData.manager.persistentVolumeClaims),
            'utf8'
          );
          fileCount++;
        }

        // Manager kustomization.yaml
        const managerKustomization = {
          apiVersion: 'kustomize.config.k8s.io/v1beta1',
          kind: 'Kustomization',
          namespace: backupData.namespace,
          resources: [
            'deployment.yaml',
            'service.yaml',
            'configmap.yaml',
            'pvc.yaml'
          ].filter(async (file) => {
            try {
              await fs.access(path.join(managerPath, file));
              return true;
            } catch {
              return false;
            }
          })
        };

        await fs.writeFile(
          path.join(managerPath, 'kustomization.yaml'),
          YAML.stringify(managerKustomization),
          'utf8'
        );
        fileCount++;
      }

      // Write project resources
      const projectNames: string[] = [];
      
      for (const [shortName, projectData] of Object.entries(backupData.projects || {})) {
        const projectPath = path.join(this.backupDir, 'projects', shortName as string);
        await fs.mkdir(projectPath, { recursive: true });

        const project = projectData as any;

        // StatefulSet
        if (project.statefulSet) {
          await fs.writeFile(
            path.join(projectPath, 'StatefulSet.yaml'),
            YAML.stringify(project.statefulSet),
            'utf8'
          );
          fileCount++;
        }

        // Services
        if (project.services?.length > 0) {
          await fs.writeFile(
            path.join(projectPath, 'Service.yaml'),
            YAML.stringify(project.services),
            'utf8'
          );
          fileCount++;
        }

        // ConfigMaps
        if (project.configMaps?.length > 0) {
          await fs.writeFile(
            path.join(projectPath, 'ConfigMap.yaml'),
            YAML.stringify(project.configMaps),
            'utf8'
          );
          fileCount++;
        }

        // Project kustomization.yaml
        const projectKustomization = {
          apiVersion: 'kustomize.config.k8s.io/v1beta1',
          kind: 'Kustomization',
          resources: [
            'StatefulSet.yaml',
            'Service.yaml',
            'ConfigMap.yaml'
          ]
        };

        await fs.writeFile(
          path.join(projectPath, 'kustomization.yaml'),
          YAML.stringify(projectKustomization),
          'utf8'
        );
        fileCount++;

        projectNames.push(shortName as string);
      }

      // Root projects kustomization.yaml
      if (projectNames.length > 0) {
        const projectsKustomization = {
          apiVersion: 'kustomize.config.k8s.io/v1beta1',
          kind: 'Kustomization',
          resources: projectNames.map(name => `${name}/`)
        };

        await fs.writeFile(
          path.join(this.backupDir, 'projects', 'kustomization.yaml'),
          YAML.stringify(projectsKustomization),
          'utf8'
        );
        fileCount++;
      }

      // Root kustomization.yaml
      const rootKustomization = {
        apiVersion: 'kustomize.config.k8s.io/v1beta1',
        kind: 'Kustomization',
        namespace: backupData.namespace,
        resources: [
          'manager/',
          ...(projectNames.length > 0 ? ['projects/'] : [])
        ]
      };

      await fs.writeFile(
        path.join(this.backupDir, 'kustomization.yaml'),
        YAML.stringify(rootKustomization),
        'utf8'
      );
      fileCount++;

      // Backup manifest
      const manifest = {
        backupDate: new Date().toISOString(),
        timestamp,
        version: '2.0',
        namespace: backupData.namespace,
        structure: 'kustomize-overlays',
        manager: {
          resources: Object.keys(backupData.manager || {}).length
        },
        projects: {
          count: projectNames.length,
          names: projectNames
        },
        clusterInfo: backupData.clusterInfo
      };

      await fs.writeFile(
        path.join(this.backupDir, 'backup-manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8'
      );
      fileCount++;

      kubernetesLogger.info(`Created backup structure with ${projectNames.length} projects`);
      
      return fileCount;

    } catch (error) {
      logError(error, { context: 'write-backup-structure' });
      throw error;
    }
  }
}