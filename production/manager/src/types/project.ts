export interface GitCredential {
  id: string;
  name: string;
  type: 'token' | 'ssh-key' | 'none';
  provider: 'github' | 'gitlab' | 'bitbucket' | 'other';
  // Stored encrypted in actual implementation
  token?: string;
  sshPrivateKey?: string;
  sshPublicKey?: string;
  username?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiKey: string;
  projectKeys: string[];
}

export interface ProjectConfig {
  id: string;
  name: string;
  shortName: string;
  gitRepository: string;
  gitCredentialId: string;
  gitProvider: 'github' | 'gitlab' | 'bitbucket' | 'other';
  gitAuthMethod: 'token' | 'ssh-key' | 'none';
  
  // Kubernetes configuration
  namespace: string;
  nodePortBase?: number;
  
  // JIRA integration
  jiraConfig?: JiraConfig;
  
  // Claude Code configuration
  anthropicApiKey: string;
  codeServerPassword?: string; // Optional - only needed for local dev, SSO handles auth in production
  sudoPassword: string;
  
  // Resource limits
  resources?: {
    cpu?: string;
    memory?: string;
  };
  
  // Storage configuration
  storage?: {
    size?: string;
    storageClass?: string;
  };
  
  // Legacy resource format (keeping for compatibility)
  resourceLimits?: {
    requests?: {
      memory?: string;
      cpu?: string;
    };
    limits?: {
      memory?: string;
      cpu?: string;
    };
  };
  
  // Status
  status: 'creating' | 'running' | 'stopped' | 'error' | 'deleting';
  deploymentStatus?: {
    phase: string;
    message?: string;
    lastUpdated: Date;
  };
  
  // URLs for access
  urls?: {
    vscode: string;
    agentapi: string;
    devServer?: string;
  };
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface ProjectMetrics {
  projectId: string;
  cpuUsage: number;
  memoryUsage: number;
  storageUsage: number;
  lastActive: Date;
  uptime: number;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  type: 'user' | 'claude' | 'system';
  content: string;
  timestamp: Date;
  status?: 'pending' | 'sent' | 'delivered' | 'error';
}

export interface ProjectCreateRequest {
  name: string;
  shortName?: string;
  gitRepository: string;
  gitCredentialId?: string;
  jiraProjectKeys?: string[];
  anthropicApiKey: string;
  codeServerPassword?: string; // Optional - only for local dev
  sudoPassword: string;
  jiraConfig?: Partial<JiraConfig>;
  resources?: ProjectConfig['resources'];
}

export interface ProjectUpdateRequest {
  name?: string;
  jiraProjectKeys?: string[];
  anthropicApiKey?: string;
  codeServerPassword?: string;
  sudoPassword?: string;
  jiraConfig?: Partial<JiraConfig>;
  resources?: ProjectConfig['resources'];
}

export interface ProjectListResponse {
  projects: ProjectConfig[];
  total: number;
  page: number;
  limit: number;
}

export interface ProjectStats {
  total: number;
  running: number;
  stopped: number;
  error: number;
  creating: number;
}

export interface WebhookEvent {
  id: string;
  type: 'jira_issue_created' | 'jira_issue_updated' | 'jira_issue_assigned';
  projectKey: string;
  issueKey: string;
  targetProjectId?: string;
  routed: boolean;
  timestamp: Date;
  payload: any;
}