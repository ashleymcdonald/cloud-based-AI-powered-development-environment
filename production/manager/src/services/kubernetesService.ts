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
    const timer = kubernetesOperationsTotal.labels({ operation: 'create', status: 'processing' }).inc();
    
    try {
      kubernetesLogger.info(`Creating Kubernetes resources for project: ${project.name}`, { 
        projectId: project.id,
        shortName: project.shortName 
      });

      // Create ConfigMap first
      await this.createProjectConfigMap(project);
      
      // Create Service
      await this.createProjectService(project);
      
      // Create StatefulSet with PVC template
      await this.createProjectStatefulSet(project);

      kubernetesOperationsTotal.labels({ operation: 'create', status: 'success' }).inc();
      kubernetesResourcesGauge.labels({ resource_type: 'statefulset', namespace: this.namespace }).inc();
      kubernetesResourcesGauge.labels({ resource_type: 'service', namespace: this.namespace }).inc();
      kubernetesResourcesGauge.labels({ resource_type: 'configmap', namespace: this.namespace }).inc();

      logProjectOperation('kubernetes-create', project.id, { 
        shortName: project.shortName,
        resources: ['StatefulSet', 'Service', 'ConfigMap']
      });

    } catch (error) {
      kubernetesOperationsTotal.labels({ operation: 'create', status: 'error' }).inc();
      logError(error, { context: 'kubernetes-create-project', projectId: project.id });
      throw error;
    }
  }

  private async createProjectConfigMap(project: ProjectConfig): Promise<void> {
    const configMapName = `project-${project.shortName}`;
    
    const configMap: k8s.V1ConfigMap = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: configMapName,
        namespace: this.namespace,
        labels: {
          app: `project-${project.shortName}`,
          component: 'project',
          'project-id': project.id,
          'project-name': project.name,
          'managed-by': 'claude-manager'
        }
      },
      data: {
        GIT_REPOSITORY: project.gitRepository,
        GIT_AUTH_TYPE: project.gitAuth?.type || 'none',
        ANTHROPIC_API_KEY: project.anthropicApiKey,
        SUDO_PASSWORD: project.sudoPassword,
        PROJECT_NAME: project.name,
        PROJECT_SHORT_NAME: project.shortName,
        ...(project.jiraConfig && {
          JIRA_BASE_URL: project.jiraConfig.baseUrl,
          JIRA_EMAIL: project.jiraConfig.email,
          JIRA_API_KEY: project.jiraConfig.apiKey,
          JIRA_PROJECT_KEYS: project.jiraConfig.projectKeys.join(',')
        })
      }
    };

    await this.k8sApi.createNamespacedConfigMap(this.namespace, configMap);
    kubernetesLogger.info(`Created ConfigMap: ${configMapName}`);
  }

  private async createProjectService(project: ProjectConfig): Promise<void> {
    const serviceName = `project-${project.shortName}-service`;
    
    const service: k8s.V1Service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: serviceName,
        namespace: this.namespace,
        labels: {
          app: `project-${project.shortName}`,
          component: 'project',
          'project-id': project.id,
          'project-name': project.name,
          'managed-by': 'claude-manager'
        }
      },
      spec: {
        type: 'ClusterIP',
        ports: [
          {
            name: 'code-server',
            port: 8443,
            targetPort: 8443,
            protocol: 'TCP'
          },
          {
            name: 'agent-api',
            port: 3284,
            targetPort: 3284,
            protocol: 'TCP'
          },
          {
            name: 'dev-server',
            port: 3000,
            targetPort: 3000,
            protocol: 'TCP'
          }
        ],
        selector: {
          app: `project-${project.shortName}`
        }
      }
    };

    await this.k8sApi.createNamespacedService(this.namespace, service);
    kubernetesLogger.info(`Created Service: ${serviceName}`);
  }

  private async createProjectStatefulSet(project: ProjectConfig): Promise<void> {
    const statefulSetName = `project-${project.shortName}`;
    
    const statefulSet: k8s.V1StatefulSet = {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: {
        name: statefulSetName,
        namespace: this.namespace,
        labels: {
          app: `project-${project.shortName}`,
          component: 'project',
          'project-id': project.id,
          'project-name': project.name,
          'managed-by': 'claude-manager'
        }
      },
      spec: {
        serviceName: `project-${project.shortName}-service`,
        replicas: 1,
        selector: {
          matchLabels: {
            app: `project-${project.shortName}`
          }
        },
        template: {
          metadata: {
            labels: {
              app: `project-${project.shortName}`,
              component: 'project',
              'project-id': project.id,
              'project-name': project.name,
              'managed-by': 'claude-manager'
            },
            annotations: {
              'prometheus.io/scrape': 'true',
              'prometheus.io/port': '3284',
              'prometheus.io/path': '/metrics'
            }
          },
          spec: {
            containers: [
              {
                name: 'claude-dev-env',
                image: process.env.CLAUDE_DEV_IMAGE || 'claude-dev-env:latest',
                ports: [
                  { containerPort: 8443, name: 'code-server' },
                  { containerPort: 3284, name: 'agent-api' },
                  { containerPort: 3000, name: 'dev-server' }
                ],
                env: [
                  {
                    name: 'SUDO_PASSWORD',
                    valueFrom: {
                      configMapKeyRef: {
                        name: `project-${project.shortName}`,
                        key: 'SUDO_PASSWORD'
                      }
                    }
                  },
                  {
                    name: 'ANTHROPIC_API_KEY',
                    valueFrom: {
                      configMapKeyRef: {
                        name: `project-${project.shortName}`,
                        key: 'ANTHROPIC_API_KEY'
                      }
                    }
                  },
                  {
                    name: 'GIT_REPOSITORY',
                    valueFrom: {
                      configMapKeyRef: {
                        name: `project-${project.shortName}`,
                        key: 'GIT_REPOSITORY'
                      }
                    }
                  },
                  {
                    name: 'PROJECT_NAME',
                    valueFrom: {
                      configMapKeyRef: {
                        name: `project-${project.shortName}`,
                        key: 'PROJECT_NAME'
                      }
                    }
                  }
                ],
                volumeMounts: [
                  {
                    name: 'workspace',
                    mountPath: '/workspace'
                  },
                  {
                    name: 'config',
                    mountPath: '/config'
                  }
                ],
                resources: {
                  requests: {
                    cpu: project.resources?.cpu || '500m',
                    memory: project.resources?.memory || '1Gi'
                  },
                  limits: {
                    cpu: project.resources?.cpu?.replace('m', '') ? 
                      `${parseInt(project.resources.cpu.replace('m', '')) * 2}m` : '2',
                    memory: project.resources?.memory?.replace('Gi', '') ? 
                      `${parseInt(project.resources.memory.replace('Gi', '')) * 2}Gi` : '4Gi'
                  }
                },
                livenessProbe: {
                  httpGet: {
                    path: '/healthz',
                    port: 8443
                  },
                  initialDelaySeconds: 60,
                  periodSeconds: 30,
                  timeoutSeconds: 10
                },
                readinessProbe: {
                  httpGet: {
                    path: '/healthz',
                    port: 8443
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                  timeoutSeconds: 5
                },
                securityContext: {
                  allowPrivilegeEscalation: false,
                  runAsNonRoot: false, // code-server needs to run as root
                  readOnlyRootFilesystem: false,
                  capabilities: {
                    drop: ['ALL'],
                    add: ['CHOWN', 'DAC_OVERRIDE', 'SETUID', 'SETGID']
                  }
                }
              }
            ],
            securityContext: {
              fsGroup: 1000
            }
          }
        },
        volumeClaimTemplates: [
          {
            metadata: {
              name: 'workspace',
              labels: {
                app: `project-${project.shortName}`,
                component: 'project-storage'
              }
            },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: project.storage?.storageClass || process.env.DEFAULT_STORAGE_CLASS || undefined,
              resources: {
                requests: {
                  storage: project.storage?.size || process.env.DEFAULT_WORKSPACE_SIZE || '20Gi'
                }
              }
            }
          },
          {
            metadata: {
              name: 'config',
              labels: {
                app: `project-${project.shortName}`,
                component: 'project-storage'
              }
            },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: project.storage?.storageClass || process.env.DEFAULT_STORAGE_CLASS || undefined,
              resources: {
                requests: {
                  storage: process.env.DEFAULT_CONFIG_SIZE || '5Gi'
                }
              }
            }
          }
        ]
      }
    };

    await this.k8sAppsApi.createNamespacedStatefulSet(this.namespace, statefulSet);
    kubernetesLogger.info(`Created StatefulSet: ${statefulSetName}`);
  }

  async updateProject(project: ProjectConfig): Promise<void> {
    const timer = kubernetesOperationsTotal.labels({ operation: 'update', status: 'processing' }).inc();
    
    try {
      // Update ConfigMap
      const configMapName = `project-${project.shortName}`;
      const configMapResponse = await this.k8sApi.readNamespacedConfigMap(configMapName, this.namespace);
      const configMap = configMapResponse.body;
      
      // Update data
      configMap.data = {
        ...configMap.data,
        ANTHROPIC_API_KEY: project.anthropicApiKey,
        SUDO_PASSWORD: project.sudoPassword,
        PROJECT_NAME: project.name,
        ...(project.jiraConfig && {
          JIRA_BASE_URL: project.jiraConfig.baseUrl,
          JIRA_EMAIL: project.jiraConfig.email,
          JIRA_API_KEY: project.jiraConfig.apiKey,
          JIRA_PROJECT_KEYS: project.jiraConfig.projectKeys.join(',')
        })
      };

      await this.k8sApi.replaceNamespacedConfigMap(configMapName, this.namespace, configMap);
      
      kubernetesOperationsTotal.labels({ operation: 'update', status: 'success' }).inc();
      logProjectOperation('kubernetes-update', project.id, { shortName: project.shortName });

    } catch (error) {
      kubernetesOperationsTotal.labels({ operation: 'update', status: 'error' }).inc();
      logError(error, { context: 'kubernetes-update-project', projectId: project.id });
      throw error;
    }
  }

  async deleteProject(project: ProjectConfig): Promise<void> {
    const timer = kubernetesOperationsTotal.labels({ operation: 'delete', status: 'processing' }).inc();
    
    try {
      const shortName = project.shortName;
      
      // Delete StatefulSet
      try {
        await this.k8sAppsApi.deleteNamespacedStatefulSet(`project-${shortName}`, this.namespace);
        kubernetesLogger.info(`Deleted StatefulSet: project-${shortName}`);
      } catch (error) {
        kubernetesLogger.warn(`Failed to delete StatefulSet: project-${shortName}`, { error });
      }

      // Delete Service
      try {
        await this.k8sApi.deleteNamespacedService(`project-${shortName}-service`, this.namespace);
        kubernetesLogger.info(`Deleted Service: project-${shortName}-service`);
      } catch (error) {
        kubernetesLogger.warn(`Failed to delete Service: project-${shortName}-service`, { error });
      }

      // Delete ConfigMap
      try {
        await this.k8sApi.deleteNamespacedConfigMap(`project-${shortName}`, this.namespace);
        kubernetesLogger.info(`Deleted ConfigMap: project-${shortName}`);
      } catch (error) {
        kubernetesLogger.warn(`Failed to delete ConfigMap: project-${shortName}`, { error });
      }

      // Note: PVCs are retained by default for data safety
      // They can be manually deleted if needed

      kubernetesOperationsTotal.labels({ operation: 'delete', status: 'success' }).inc();
      kubernetesResourcesGauge.labels({ resource_type: 'statefulset', namespace: this.namespace }).dec();
      kubernetesResourcesGauge.labels({ resource_type: 'service', namespace: this.namespace }).dec();
      kubernetesResourcesGauge.labels({ resource_type: 'configmap', namespace: this.namespace }).dec();

      logProjectOperation('kubernetes-delete', project.id, { shortName });

    } catch (error) {
      kubernetesOperationsTotal.labels({ operation: 'delete', status: 'error' }).inc();
      logError(error, { context: 'kubernetes-delete-project', projectId: project.id });
      throw error;
    }
  }

  async getProjectStatus(project: ProjectConfig): Promise<{
    phase: string;
    message: string;
    ready: boolean;
  }> {
    try {
      const statefulSetName = `project-${project.shortName}`;
      const response = await this.k8sAppsApi.readNamespacedStatefulSet(statefulSetName, this.namespace);
      const statefulSet = response.body;

      const replicas = statefulSet.spec?.replicas || 0;
      const readyReplicas = statefulSet.status?.readyReplicas || 0;
      const currentReplicas = statefulSet.status?.currentReplicas || 0;

      if (readyReplicas === replicas && replicas > 0) {
        return {
          phase: 'Running',
          message: 'Project is running normally',
          ready: true
        };
      } else if (currentReplicas > 0 && readyReplicas < replicas) {
        return {
          phase: 'Pending',
          message: 'Project is starting up',
          ready: false
        };
      } else if (replicas === 0) {
        return {
          phase: 'Stopped',
          message: 'Project is stopped',
          ready: false
        };
      } else {
        return {
          phase: 'Failed',
          message: 'Project failed to start',
          ready: false
        };
      }

    } catch (error) {
      logError(error, { context: 'get-project-status', projectId: project.id });
      return {
        phase: 'Unknown',
        message: 'Unable to determine project status',
        ready: false
      };
    }
  }

  async scaleProject(project: ProjectConfig, replicas: number): Promise<void> {
    try {
      const statefulSetName = `project-${project.shortName}`;
      const response = await this.k8sAppsApi.readNamespacedStatefulSet(statefulSetName, this.namespace);
      const statefulSet = response.body;

      statefulSet.spec!.replicas = replicas;
      await this.k8sAppsApi.replaceNamespacedStatefulSet(statefulSetName, this.namespace, statefulSet);

      kubernetesLogger.info(`Scaled project ${project.name} to ${replicas} replicas`);
      logProjectOperation('kubernetes-scale', project.id, { shortName: project.shortName, replicas });

    } catch (error) {
      logError(error, { context: 'scale-project', projectId: project.id, replicas });
      throw error;
    }
  }
}