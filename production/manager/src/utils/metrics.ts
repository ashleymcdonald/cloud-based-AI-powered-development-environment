import client from 'prom-client';

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'claude-manager'
});

// Collect default metrics from Node.js process
client.collectDefaultMetrics({ register });

// Custom metrics for Claude Manager

// HTTP request metrics
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// Project metrics
export const projectsTotal = new client.Gauge({
  name: 'projects_total',
  help: 'Total number of active projects'
});

export const projectOperationsTotal = new client.Counter({
  name: 'project_operations_total',
  help: 'Total number of project operations',
  labelNames: ['operation', 'status']
});

export const projectCreationDuration = new client.Histogram({
  name: 'project_creation_duration_seconds',
  help: 'Duration of project creation in seconds',
  buckets: [1, 5, 10, 30, 60, 120, 300]
});

// Kubernetes metrics
export const kubernetesOperationsTotal = new client.Counter({
  name: 'kubernetes_operations_total',
  help: 'Total number of Kubernetes operations',
  labelNames: ['operation', 'status']
});

export const kubernetesResourcesGauge = new client.Gauge({
  name: 'kubernetes_resources_total',
  help: 'Total number of Kubernetes resources',
  labelNames: ['resource_type', 'namespace']
});

// Webhook metrics
export const webhookRequestsTotal = new client.Counter({
  name: 'webhook_requests_total',
  help: 'Total number of webhook requests',
  labelNames: ['source', 'event_type', 'status']
});

export const webhookProcessingDuration = new client.Histogram({
  name: 'webhook_processing_duration_seconds',
  help: 'Duration of webhook processing in seconds',
  labelNames: ['source', 'event_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// Chat metrics
export const chatMessagesTotal = new client.Counter({
  name: 'chat_messages_total',
  help: 'Total number of chat messages',
  labelNames: ['project_id', 'direction'] // 'sent' or 'received'
});

export const activeChatConnections = new client.Gauge({
  name: 'active_chat_connections',
  help: 'Number of active chat connections'
});

// System health metrics
export const systemHealth = new client.Gauge({
  name: 'system_health_status',
  help: 'System health status (1 = healthy, 0 = unhealthy)',
  labelNames: ['component']
});

export const errorRate = new client.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['service', 'error_type']
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(projectsTotal);
register.registerMetric(projectOperationsTotal);
register.registerMetric(projectCreationDuration);
register.registerMetric(kubernetesOperationsTotal);
register.registerMetric(kubernetesResourcesGauge);
register.registerMetric(webhookRequestsTotal);
register.registerMetric(webhookProcessingDuration);
register.registerMetric(chatMessagesTotal);
register.registerMetric(activeChatConnections);
register.registerMetric(systemHealth);
register.registerMetric(errorRate);

// Health check function
export const updateSystemHealth = async () => {
  try {
    // Check various system components
    const components = [
      { name: 'api', check: () => true }, // API is running if this function executes
      { name: 'kubernetes', check: checkKubernetesHealth },
      { name: 'storage', check: checkStorageHealth },
    ];

    for (const component of components) {
      try {
        const isHealthy = await component.check();
        systemHealth.set({ component: component.name }, isHealthy ? 1 : 0);
      } catch (error) {
        systemHealth.set({ component: component.name }, 0);
        errorRate.inc({ service: component.name, error_type: 'health_check' });
      }
    }
  } catch (error) {
    // If we can't even run health checks, mark everything as unhealthy
    systemHealth.set({ component: 'system' }, 0);
  }
};

// Helper functions for health checks
async function checkKubernetesHealth(): Promise<boolean> {
  // This would check if we can connect to Kubernetes API
  // For now, return true - implement actual check based on your K8s client
  return true;
}

async function checkStorageHealth(): Promise<boolean> {
  // This would check if storage/database is accessible
  // For now, return true - implement actual check based on your storage
  return true;
}

// Initialize health metrics
updateSystemHealth();

// Update health metrics every 30 seconds
setInterval(updateSystemHealth, 30000);

export { register };
export default register;