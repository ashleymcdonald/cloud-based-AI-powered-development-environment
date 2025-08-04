import { Router, Request, Response } from 'express';
import { register } from '@/utils/metrics';
import { apiLogger } from '@/utils/logger';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// Prometheus metrics endpoint
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    apiLogger.error('Failed to generate metrics', { error });
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// System status endpoint
router.get('/status', async (req: Request, res: Response) => {
  try {
    const metrics = await register.getMetricsAsJSON();
    const systemMetrics = metrics.filter(m => 
      ['system_health_status', 'projects_total', 'active_chat_connections'].includes(m.name)
    );

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: systemMetrics,
      process: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        version: process.version,
        platform: process.platform
      }
    });
  } catch (error) {
    apiLogger.error('Failed to get system status', { error });
    res.status(500).json({ error: 'Failed to get system status' });
  }
});

// Logs endpoint
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const { service, level, limit = '100' } = req.query;
    const logDir = 'logs';
    const logFiles = await fs.readdir(logDir);
    
    // Filter log files based on service if specified
    let targetFiles = logFiles;
    if (service) {
      targetFiles = logFiles.filter(file => file.includes(service as string));
    }

    const logs: any[] = [];
    
    for (const file of targetFiles.slice(0, 5)) { // Limit to 5 files max
      try {
        const filePath = path.join(logDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        // Parse each line as JSON log entry
        for (const line of lines.slice(-parseInt(limit as string))) {
          try {
            const logEntry = JSON.parse(line);
            if (!level || logEntry.level === level) {
              logs.push({
                ...logEntry,
                source: file
              });
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      } catch (error) {
        apiLogger.warn(`Failed to read log file: ${file}`, { error });
      }
    }

    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      logs: logs.slice(0, parseInt(limit as string)),
      total: logs.length,
      filters: { service, level, limit }
    });
  } catch (error) {
    apiLogger.error('Failed to retrieve logs', { error });
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// Monitoring dashboard page
router.get('/dashboard', (req: Request, res: Response) => {
  const dashboardHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Manager - Monitoring Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        .metric-card {
            border-left: 4px solid #007bff;
        }
        .metric-value {
            font-size: 2rem;
            font-weight: bold;
            color: #007bff;
        }
        .log-entry {
            font-family: 'Courier New', monospace;
            font-size: 0.875rem;
        }
        .log-error { border-left: 3px solid #dc3545; }
        .log-warn { border-left: 3px solid #ffc107; }
        .log-info { border-left: 3px solid #17a2b8; }
        .log-debug { border-left: 3px solid #6c757d; }
        .refresh-indicator {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <nav class="navbar navbar-dark bg-dark">
        <div class="container-fluid">
            <span class="navbar-brand mb-0 h1">
                <i class="fas fa-chart-line me-2"></i>
                Claude Manager - Monitoring Dashboard
            </span>
            <div class="d-flex">
                <button class="btn btn-outline-light btn-sm me-2" onclick="refreshData()">
                    <i class="fas fa-sync-alt" id="refresh-icon"></i> Refresh
                </button>
                <span class="navbar-text" id="last-updated">Last updated: --</span>
            </div>
        </div>
    </nav>

    <div class="container-fluid mt-4">
        <!-- System Status Row -->
        <div class="row mb-4">
            <div class="col-12">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0"><i class="fas fa-heartbeat me-2"></i>System Status</h5>
                    </div>
                    <div class="card-body">
                        <div class="row" id="system-status">
                            <!-- Dynamic status cards will be inserted here -->
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Metrics Row -->
        <div class="row mb-4">
            <div class="col-md-3">
                <div class="card metric-card">
                    <div class="card-body text-center">
                        <h6 class="card-title">Active Projects</h6>
                        <div class="metric-value" id="projects-count">--</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card metric-card">
                    <div class="card-body text-center">
                        <h6 class="card-title">Chat Connections</h6>
                        <div class="metric-value" id="chat-connections">--</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card metric-card">
                    <div class="card-body text-center">
                        <h6 class="card-title">Uptime</h6>
                        <div class="metric-value" id="uptime">--</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card metric-card">
                    <div class="card-body text-center">
                        <h6 class="card-title">Memory Usage</h6>
                        <div class="metric-value" id="memory-usage">--</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Charts Row -->
        <div class="row mb-4">
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h6 class="mb-0">HTTP Requests (Last Hour)</h6>
                    </div>
                    <div class="card-body">
                        <canvas id="requests-chart" width="400" height="200"></canvas>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h6 class="mb-0">Response Times</h6>
                    </div>
                    <div class="card-body">
                        <canvas id="response-times-chart" width="400" height="200"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <!-- Logs Row -->
        <div class="row">
            <div class="col-12">
                <div class="card">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h6 class="mb-0"><i class="fas fa-file-alt me-2"></i>Recent Logs</h6>
                        <div>
                            <select class="form-select form-select-sm d-inline-block w-auto me-2" id="log-level-filter">
                                <option value="">All Levels</option>
                                <option value="error">Error</option>
                                <option value="warn">Warning</option>
                                <option value="info">Info</option>
                                <option value="debug">Debug</option>
                            </select>
                            <select class="form-select form-select-sm d-inline-block w-auto" id="log-service-filter">
                                <option value="">All Services</option>
                                <option value="api">API</option>
                                <option value="project">Project</option>
                                <option value="webhook">Webhook</option>
                                <option value="kubernetes">Kubernetes</option>
                            </select>
                        </div>
                    </div>
                    <div class="card-body" style="max-height: 400px; overflow-y: auto;">
                        <div id="logs-container">
                            <div class="text-center">
                                <div class="spinner-border" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        let requestsChart, responseTimesChart;

        // Initialize charts
        function initializeCharts() {
            // HTTP Requests Chart
            const requestsCtx = document.getElementById('requests-chart').getContext('2d');
            requestsChart = new Chart(requestsCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Requests/min',
                        data: [],
                        borderColor: '#007bff',
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });

            // Response Times Chart
            const responseCtx = document.getElementById('response-times-chart').getContext('2d');
            responseTimesChart = new Chart(responseCtx, {
                type: 'doughnut',
                data: {
                    labels: ['< 100ms', '100-500ms', '500ms-1s', '> 1s'],
                    datasets: [{
                        data: [0, 0, 0, 0],
                        backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545']
                    }]
                },
                options: {
                    responsive: true
                }
            });
        }

        // Load system status
        async function loadSystemStatus() {
            try {
                const response = await fetch('/api/monitoring/status');
                const data = await response.json();
                
                // Update metrics
                document.getElementById('uptime').textContent = formatUptime(data.process.uptime);
                document.getElementById('memory-usage').textContent = formatBytes(data.process.memory.heapUsed);
                
                // Update projects and chat connections from metrics
                const projectsMetric = data.metrics.find(m => m.name === 'projects_total');
                const chatMetric = data.metrics.find(m => m.name === 'active_chat_connections');
                
                document.getElementById('projects-count').textContent = projectsMetric?.values[0]?.value || '0';
                document.getElementById('chat-connections').textContent = chatMetric?.values[0]?.value || '0';
                
                // Update system status cards
                updateSystemStatusCards(data.metrics);
                
            } catch (error) {
                console.error('Failed to load system status:', error);
            }
        }

        // Update system status cards
        function updateSystemStatusCards(metrics) {
            const healthMetric = metrics.find(m => m.name === 'system_health_status');
            const container = document.getElementById('system-status');
            
            if (healthMetric && healthMetric.values) {
                container.innerHTML = healthMetric.values.map(value => {
                    const isHealthy = value.value === 1;
                    const component = value.labels.component;
                    return \`
                        <div class="col-md-4">
                            <div class="alert \${isHealthy ? 'alert-success' : 'alert-danger'} mb-2">
                                <i class="fas \${isHealthy ? 'fa-check-circle' : 'fa-exclamation-triangle'} me-2"></i>
                                <strong>\${component.charAt(0).toUpperCase() + component.slice(1)}</strong>: 
                                \${isHealthy ? 'Healthy' : 'Unhealthy'}
                            </div>
                        </div>
                    \`;
                }).join('');
            }
        }

        // Load logs
        async function loadLogs() {
            try {
                const level = document.getElementById('log-level-filter').value;
                const service = document.getElementById('log-service-filter').value;
                
                const params = new URLSearchParams();
                if (level) params.append('level', level);
                if (service) params.append('service', service);
                params.append('limit', '50');
                
                const response = await fetch(\`/api/monitoring/logs?\${params}\`);
                const data = await response.json();
                
                const container = document.getElementById('logs-container');
                container.innerHTML = data.logs.map(log => \`
                    <div class="log-entry log-\${log.level} p-2 mb-1 border-start">
                        <div class="d-flex justify-content-between">
                            <span class="fw-bold">\${log.timestamp}</span>
                            <span class="badge bg-\${getLevelColor(log.level)}">\${log.level.toUpperCase()}</span>
                        </div>
                        <div>\${log.message}</div>
                        \${log.service ? \`<small class="text-muted">[\${log.service}]</small>\` : ''}
                    </div>
                \`).join('');
                
            } catch (error) {
                console.error('Failed to load logs:', error);
                document.getElementById('logs-container').innerHTML = 
                    '<div class="alert alert-danger">Failed to load logs</div>';
            }
        }

        // Helper functions
        function formatUptime(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return \`\${hours}h \${minutes}m\`;
        }

        function formatBytes(bytes) {
            const MB = bytes / (1024 * 1024);
            return \`\${MB.toFixed(1)} MB\`;
        }

        function getLevelColor(level) {
            const colors = {
                error: 'danger',
                warn: 'warning', 
                info: 'info',
                debug: 'secondary'
            };
            return colors[level] || 'secondary';
        }

        // Refresh all data
        function refreshData() {
            const icon = document.getElementById('refresh-icon');
            icon.classList.add('refresh-indicator');
            
            Promise.all([
                loadSystemStatus(),
                loadLogs()
            ]).finally(() => {
                icon.classList.remove('refresh-indicator');
                document.getElementById('last-updated').textContent = 
                    \`Last updated: \${new Date().toLocaleTimeString()}\`;
            });
        }

        // Event listeners
        document.getElementById('log-level-filter').addEventListener('change', loadLogs);
        document.getElementById('log-service-filter').addEventListener('change', loadLogs);

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            initializeCharts();
            refreshData();
            
            // Auto-refresh every 30 seconds
            setInterval(refreshData, 30000);
        });
    </script>
</body>
</html>
  `;

  res.send(dashboardHtml);
});

export default router;