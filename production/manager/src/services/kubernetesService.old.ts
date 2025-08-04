import * as k8s from '@kubernetes/client-node';
import { ProjectConfig } from '@/types/project';
import { kubernetesLogger, logError, logProjectOperation } from '@/utils/logger';
import { kubernetesOperationsTotal, kubernetesResourcesGauge } from '@/utils/metrics';
import YAML from 'yaml';

export class KubernetesService {
  private k8sApi: k8s.CoreV1Api;
  private k8sAppsApi: k8s.AppsV1Api;
  private kc: k8s.KubeConfig;
  private namespace: string;

  constructor() {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();
    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.k8sAppsApi = this.kc.makeApiClient(k8s.AppsV1Api);
    this.namespace = process.env.KUBERNETES_NAMESPACE || 'claude-manager';
  }

  async createProject(project: ProjectConfig): Promise<void> {
    try {
      this.logger.info(`Creating Kubernetes resources for project: ${project.name}`);

      // Create namespace
      await this.createNamespace(project);

      // Create secrets
      await this.createSecrets(project);

      // Create configmap
      await this.createConfigMap(project);

      // Create PVCs
      await this.createPVCs(project);

      // Create deployment
      await this.createDeployment(project);

      // Create services
      await this.createServices(project);

      this.logger.info(`Successfully created Kubernetes resources for project: ${project.name}`);
    } catch (error) {
      this.logger.error(`Failed to create project ${project.name}:`, error);
      throw error;
    }
  }

  async deleteProject(project: ProjectConfig): Promise<void> {
    try {
      this.logger.info(`Deleting Kubernetes resources for project: ${project.name}`);
      
      // Delete the entire namespace (cascades to all resources)
      await this.k8sApi.deleteNamespace(project.namespace);
      
      this.logger.info(`Successfully deleted project: ${project.name}`);
    } catch (error) {
      this.logger.error(`Failed to delete project ${project.name}:`, error);
      throw error;
    }
  }

  async getProjectStatus(project: ProjectConfig): Promise<{
    phase: string;
    message?: string;
    ready: boolean;
    replicas: { ready: number; total: number };
  }> {
    try {
      const deploymentName = `${project.shortName}-claude-dev-env`;
      const deployment = await this.k8sAppsApi.readNamespacedDeployment(
        deploymentName,
        project.namespace
      );

      const status = deployment.body.status;
      const ready = (status?.readyReplicas || 0) > 0;
      
      return {
        phase: ready ? 'Running' : 'Pending',
        message: ready ? 'Deployment is ready' : 'Waiting for deployment to be ready',
        ready,
        replicas: {
          ready: status?.readyReplicas || 0,
          total: status?.replicas || 0
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get status for project ${project.name}:`, error);
      return {
        phase: 'Error',
        message: `Failed to get status: ${error.message}`,
        ready: false,
        replicas: { ready: 0, total: 0 }
      };
    }
  }

  async getProjectLogs(project: ProjectConfig, lines: number = 100): Promise<string> {
    try {
      const deploymentName = `${project.shortName}-claude-dev-env`;
      
      // Get pods for the deployment
      const pods = await this.k8sApi.listNamespacedPod(
        project.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${deploymentName}`
      );

      if (pods.body.items.length === 0) {
        return 'No pods found for this project';
      }

      const podName = pods.body.items[0].metadata!.name!;
      const logs = await this.k8sApi.readNamespacedPodLog(
        podName,
        project.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        lines
      );

      return logs.body;
    } catch (error) {
      this.logger.error(`Failed to get logs for project ${project.name}:`, error);
      return `Failed to get logs: ${error.message}`;
    }
  }

  private async createNamespace(project: ProjectConfig): Promise<void> {
    const namespaceManifest = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: project.namespace,
        labels: {
          'app': 'claude-dev-env',
          'project': project.shortName,
          'managed-by': 'claude-manager'
        }
      }
    };

    try {
      await this.k8sApi.createNamespace(namespaceManifest);
    } catch (error) {
      if (error.response?.statusCode !== 409) { // Ignore if already exists
        throw error;
      }
    }
  }

  private async createSecrets(project: ProjectConfig): Promise<void> {
    // Main secrets
    const secretData: Record<string, string> = {
      'anthropic-api-key': Buffer.from(project.anthropicApiKey).toString('base64'),
      'code-server-password': Buffer.from(project.codeServerPassword).toString('base64'),
      'sudo-password': Buffer.from(project.sudoPassword).toString('base64')
    };

    // Add git credentials based on auth method
    if (project.gitAuthMethod === 'token') {
      // Get git credential from database (mocked for now)
      secretData['git-token'] = Buffer.from('git-token-placeholder').toString('base64');
    }

    if (project.jiraConfig) {
      secretData['jira-api-key'] = Buffer.from(project.jiraConfig.apiKey).toString('base64');
    }

    const secretManifest = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: 'claude-dev-secrets',
        namespace: project.namespace,
        labels: {
          'app': 'claude-dev-env',
          'project': project.shortName
        }
      },
      type: 'Opaque',
      data: secretData
    };

    await this.k8sApi.createNamespacedSecret(project.namespace, secretManifest);

    // SSH key secret if needed
    if (project.gitAuthMethod === 'ssh-key') {
      const sshSecretManifest = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: 'claude-dev-ssh-key',
          namespace: project.namespace,
          labels: {
            'app': 'claude-dev-env',
            'project': project.shortName
          }
        },
        type: 'Opaque',
        data: {
          'ssh-privatekey': Buffer.from('ssh-private-key-placeholder').toString('base64'),
          'ssh-publickey': Buffer.from('ssh-public-key-placeholder').toString('base64')
        }
      };

      await this.k8sApi.createNamespacedSecret(project.namespace, sshSecretManifest);
    }
  }

  private async createConfigMap(project: ProjectConfig): Promise<void> {
    const configData: Record<string, string> = {
      'git-repo': project.gitRepository
    };

    if (project.jiraConfig) {
      configData['jira-base-url'] = project.jiraConfig.baseUrl;
      configData['jira-email'] = project.jiraConfig.email;
    }

    const configMapManifest = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'claude-dev-config',
        namespace: project.namespace,
        labels: {
          'app': 'claude-dev-env',
          'project': project.shortName
        }
      },
      data: configData
    };

    await this.k8sApi.createNamespacedConfigMap(project.namespace, configMapManifest);
  }

  private async createPVCs(project: ProjectConfig): Promise<void> {
    const pvcManifests = [
      {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          name: 'claude-dev-workspace',
          namespace: project.namespace,
          labels: {
            'app': 'claude-dev-env',
            'project': project.shortName
          }
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          resources: {
            requests: {
              storage: '20Gi'
            }
          }
        }
      },
      {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          name: 'claude-dev-config',
          namespace: project.namespace,
          labels: {
            'app': 'claude-dev-env',
            'project': project.shortName
          }
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          resources: {
            requests: {
              storage: '5Gi'
            }
          }
        }
      }
    ];

    for (const pvc of pvcManifests) {
      await this.k8sApi.createNamespacedPersistentVolumeClaim(project.namespace, pvc);
    }
  }

  private async createDeployment(project: ProjectConfig): Promise<void> {
    const deploymentName = `${project.shortName}-claude-dev-env`;
    
    const deploymentManifest = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: deploymentName,
        namespace: project.namespace,
        labels: {
          'app': deploymentName,
          'project': project.shortName
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            'app': deploymentName
          }
        },
        template: {
          metadata: {
            labels: {
              'app': deploymentName,
              'project': project.shortName
            }
          },
          spec: {
            containers: [
              {
                name: 'claude-dev-env',
                image: 'claude-dev-env:latest',
                ports: [
                  { containerPort: 8443, name: 'code-server' },
                  { containerPort: 3284, name: 'agentapi' },
                  { containerPort: 3000, name: 'dev-server' }
                ],
                env: [
                  { name: 'PUID', value: '1000' },
                  { name: 'PGID', value: '1000' },
                  { name: 'TZ', value: 'UTC' },
                  { name: 'DEFAULT_WORKSPACE', value: '/workspace' },
                  { name: 'GIT_PROVIDER', value: project.gitProvider },
                  { name: 'GIT_AUTH_METHOD', value: project.gitAuthMethod },
                  { name: 'PROJECT_NAME', value: project.shortName },
                  {
                    name: 'PASSWORD',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'claude-dev-secrets',
                        key: 'code-server-password'
                      }
                    }
                  },
                  {
                    name: 'SUDO_PASSWORD',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'claude-dev-secrets',
                        key: 'sudo-password'
                      }
                    }
                  },
                  {
                    name: 'ANTHROPIC_API_KEY',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'claude-dev-secrets',
                        key: 'anthropic-api-key'
                      }
                    }
                  }
                ],
                volumeMounts: [
                  { name: 'workspace', mountPath: '/workspace' },
                  { name: 'config', mountPath: '/config' }
                ],
                resources: project.resources || {
                  requests: { memory: '1Gi', cpu: '500m' },
                  limits: { memory: '4Gi', cpu: '2' }
                }
              }
            ],
            volumes: [
              {
                name: 'workspace',
                persistentVolumeClaim: { claimName: 'claude-dev-workspace' }
              },
              {
                name: 'config',
                persistentVolumeClaim: { claimName: 'claude-dev-config' }
              }
            ]
          }
        }
      }
    };

    // Add git token env var if using token auth
    if (project.gitAuthMethod === 'token') {
      deploymentManifest.spec.template.spec.containers[0].env.push({
        name: 'GIT_TOKEN',
        valueFrom: {
          secretKeyRef: {
            name: 'claude-dev-secrets',
            key: 'git-token'
          }
        }
      });
    }

    // Add SSH key volume if using SSH auth
    if (project.gitAuthMethod === 'ssh-key') {
      deploymentManifest.spec.template.spec.containers[0].volumeMounts.push({
        name: 'ssh-keys',
        mountPath: '/home/abc/.ssh',
        readOnly: true
      });

      deploymentManifest.spec.template.spec.volumes.push({
        name: 'ssh-keys',
        secret: {
          secretName: 'claude-dev-ssh-key',
          defaultMode: 0o600,
          items: [
            { key: 'ssh-privatekey', path: 'id_rsa' },
            { key: 'ssh-publickey', path: 'id_rsa.pub' }
          ]
        }
      });
    }

    // Add JIRA env vars if configured
    if (project.jiraConfig) {
      deploymentManifest.spec.template.spec.containers[0].env.push(
        {
          name: 'JIRA_BASE_URL',
          valueFrom: {
            configMapKeyRef: {
              name: 'claude-dev-config',
              key: 'jira-base-url'
            }
          }
        },
        {
          name: 'JIRA_EMAIL',
          valueFrom: {
            configMapKeyRef: {
              name: 'claude-dev-config',
              key: 'jira-email'
            }
          }
        },
        {
          name: 'JIRA_API_KEY',
          valueFrom: {
            secretKeyRef: {
              name: 'claude-dev-secrets',
              key: 'jira-api-key'
            }
          }
        }
      );
    }

    await this.k8sAppsApi.createNamespacedDeployment(project.namespace, deploymentManifest);
  }

  private async createServices(project: ProjectConfig): Promise<void> {
    const serviceName = `${project.shortName}-claude-dev-env-service`;
    const deploymentName = `${project.shortName}-claude-dev-env`;

    // ClusterIP service for internal communication
    const clusterIpService = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: serviceName,
        namespace: project.namespace,
        labels: {
          'app': deploymentName,
          'project': project.shortName
        }
      },
      spec: {
        type: 'ClusterIP',
        ports: [
          { port: 8443, targetPort: 8443, name: 'code-server' },
          { port: 3284, targetPort: 3284, name: 'agentapi' },
          { port: 3000, targetPort: 3000, name: 'dev-server' }
        ],
        selector: {
          'app': deploymentName
        }
      }
    };

    await this.k8sApi.createNamespacedService(project.namespace, clusterIpService);

    // NodePort service if nodePortBase is specified
    if (project.nodePortBase) {
      const nodePortService = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: `${serviceName}-nodeport`,
          namespace: project.namespace,
          labels: {
            'app': deploymentName,
            'project': project.shortName
          }
        },
        spec: {
          type: 'NodePort',
          ports: [
            { 
              port: 8443, 
              targetPort: 8443, 
              nodePort: project.nodePortBase + 443,
              name: 'code-server' 
            },
            { 
              port: 3284, 
              targetPort: 3284, 
              nodePort: project.nodePortBase + 284,
              name: 'agentapi' 
            },
            { 
              port: 3000, 
              targetPort: 3000, 
              nodePort: project.nodePortBase,
              name: 'dev-server' 
            }
          ],
          selector: {
            'app': deploymentName
          }
        }
      };

      await this.k8sApi.createNamespacedService(project.namespace, nodePortService);
    }
  }
}