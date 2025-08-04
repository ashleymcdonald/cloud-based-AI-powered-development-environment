# 🎛️ Claude Manager

The central management interface for Claude Code development environments. This TypeScript/Node.js application orchestrates multiple Claude Code projects, provides monitoring, handles JIRA integration, and manages Git-based backups.

## 🏗️ Architecture

```
Claude Manager
├── Web Interface     → Project management UI
├── REST API         → Project CRUD operations  
├── WebSocket Chat   → Real-time communication with Claude Code instances
├── JIRA Webhooks    → Auto-project creation from tickets
├── Kubernetes API   → StatefulSet orchestration
├── Prometheus       → Metrics collection
├── Git Backup       → State backup to repository
└── Monitoring       → Logs and system health
```

## 🚀 Quick Start

### Prerequisites
- Kubernetes cluster with kubectl access
- Node.js 18+ (for development)
- Docker (for building images)

### 1. Build and Deploy

```bash
# Build the manager image
docker build -t claude-manager:latest .

# Configure secrets (choose authentication method)
# For token-based Git backup:
kubectl create secret generic claude-manager-secrets \
  --from-literal=jira-api-key="your-jira-api-key" \
  --from-literal=default-anthropic-api-key="your-anthropic-key" \
  --from-literal=backup-git-token="your-github-token" \
  --from-literal=jwt-secret="your-jwt-secret" \
  --from-literal=webhook-secret="your-webhook-secret" \
  -n claude-manager

# For SSH key-based Git backup:
kubectl create secret generic claude-manager-secrets \
  --from-literal=jira-api-key="your-jira-api-key" \
  --from-literal=default-anthropic-api-key="your-anthropic-key" \
  --from-file=backup-ssh-private-key=/path/to/private/key \
  --from-file=backup-ssh-public-key=/path/to/public/key.pub \
  --from-literal=jwt-secret="your-jwt-secret" \
  --from-literal=webhook-secret="your-webhook-secret" \
  -n claude-manager

# Deploy to Kubernetes
cd kubernetes/
./deploy.sh
```

### 2. Access the Interface

```bash
# Port forward to access locally
kubectl port-forward svc/claude-manager-service 3000:3000 -n claude-manager

# Access at: http://localhost:3000
```

## 🎯 Features

### 📊 Project Management
- **Create Projects**: Deploy Claude Code environments as StatefulSets
- **Manage Resources**: Configure CPU, memory, and storage per project
- **Git Integration**: Support for GitHub, GitLab, Bitbucket with tokens or SSH keys
- **Status Monitoring**: Real-time project health and resource usage
- **Scaling**: Start/stop projects by scaling StatefulSets

### 💬 Real-time Chat
- **WebSocket Communication**: Send prompts directly to Claude Code instances
- **Multi-project Support**: Chat with multiple projects simultaneously  
- **Message History**: Persistent chat logs and responses
- **Connection Management**: Auto-reconnection and status indicators

### 🎫 JIRA Integration
- **Webhook Handler**: Receive JIRA ticket events
- **Auto-project Creation**: Create development environments from tickets
- **Smart Routing**: Route ticket updates to appropriate Claude Code instances
- **Custom Field Mapping**: Extract Git repositories from JIRA fields

### 📈 Monitoring & Observability
- **Prometheus Metrics**: HTTP requests, project operations, system health
- **Structured Logging**: Winston-based logging with service separation
- **Web Dashboard**: Real-time metrics visualization
- **Health Checks**: Component status and resource monitoring
- **Log Aggregation**: Retrieve logs from Kubernetes pods

### 💾 Backup & Disaster Recovery
- **Git-based Backups**: Export Kubernetes state to Git repositories
- **Kustomize Structure**: Organized as deployable overlays
- **Multiple Auth Methods**: Token or SSH key authentication
- **Automated Scheduling**: Configurable backup intervals
- **Easy Restoration**: `kubectl apply -k .` to restore

## 🔧 Configuration

### Environment Variables

```bash
# Core settings
KUBERNETES_NAMESPACE=claude-manager    # Target namespace
NODE_ENV=production                   # Environment mode
LOG_LEVEL=info                       # Logging level
PORT=3000                            # HTTP server port

# Project defaults
DEFAULT_STORAGE_CLASS=fast-ssd       # Storage class for PVCs
DEFAULT_WORKSPACE_SIZE=20Gi          # Default project disk size
DEFAULT_CONFIG_SIZE=5Gi              # Default config disk size
CLAUDE_DEV_IMAGE=claude-dev-env:latest # Container image

# JIRA integration
AUTO_CREATE_PROJECTS=true            # Enable auto-creation
JIRA_BASE_URL=https://company.atlassian.net
JIRA_EMAIL=automation@company.com
DEFAULT_GIT_ORG=your-org            # Fallback Git organization

# Backup configuration
BACKUP_GIT_REPOSITORY=git@github.com:org/k8s-backups.git
BACKUP_GIT_BRANCH=main              # Target branch
BACKUP_INTERVAL_HOURS=24            # Backup frequency
BACKUP_DIR=/app/backup              # Local backup directory

# Frontend
FRONTEND_URL=http://projects.internal # CORS origin
PROJECTS_DOMAIN=projects.internal    # Project access domain
```

### Kubernetes Secrets

The manager requires several secrets for operation:

```yaml
# claude-manager-secrets
data:
  jira-api-key: <base64-encoded>           # JIRA API key
  default-anthropic-api-key: <base64>      # Default Anthropic key
  backup-git-token: <base64>               # Git token (if using token auth)
  backup-ssh-private-key: <base64>         # SSH private key (if using SSH)
  backup-ssh-public-key: <base64>          # SSH public key (if using SSH)  
  jwt-secret: <base64>                     # JWT signing secret
  webhook-secret: <base64>                 # Webhook validation secret
```

## 📁 Directory Structure

```
manager/
├── src/                        # TypeScript source code
│   ├── controllers/            # HTTP request handlers
│   │   ├── projectController.ts
│   │   └── webhookController.ts
│   ├── services/               # Business logic
│   │   ├── projectService.ts   # Project management
│   │   ├── kubernetesService.ts # K8s API client
│   │   ├── stateService.ts     # State synchronization
│   │   ├── gitBackupService.ts # Git backup management
│   │   └── chatService.ts      # WebSocket chat handler
│   ├── routes/                 # API routes
│   │   ├── monitoring.ts       # Metrics and monitoring
│   │   └── backup.ts          # Backup management
│   ├── utils/                  # Shared utilities
│   │   ├── logger.ts          # Winston logging
│   │   └── metrics.ts         # Prometheus metrics
│   ├── types/                  # TypeScript interfaces
│   │   ├── project.ts
│   │   └── api.ts
│   └── index.ts               # Application entry point
├── public/                     # Web interface files
│   ├── index.html             # Main HTML page
│   ├── js/app.js              # Frontend JavaScript
│   └── css/app.css            # Styling
├── kubernetes/                 # Kubernetes manifests
│   ├── deployment.yaml        # Manager deployment
│   ├── service.yaml           # Service definition
│   ├── configmap.yaml         # Configuration
│   ├── secret.yaml            # Secret templates
│   ├── pvc.yaml              # Persistent volumes
│   ├── rbac.yaml             # RBAC permissions
│   ├── kustomization.yaml    # Kustomize config
│   └── deploy.sh             # Deployment script
├── package.json               # Dependencies
├── tsconfig.json             # TypeScript config
├── Dockerfile                # Container image
└── README.md                 # This file
```

## 🌐 API Reference

### Project Management

```bash
# List projects
GET /api/projects?page=1&limit=10

# Create project
POST /api/projects
{
  "name": "My Project",
  "shortName": "myproject", 
  "gitRepository": "https://github.com/org/repo.git",
  "anthropicApiKey": "sk-ant-...",
  "codeServerPassword": "secure-password",
  "sudoPassword": "sudo-password",
  "resources": {
    "cpu": "1",
    "memory": "2Gi"
  },
  "storage": {
    "size": "50Gi",
    "storageClass": "fast-ssd"
  }
}

# Get project details
GET /api/projects/:id

# Update project
PUT /api/projects/:id

# Delete project  
DELETE /api/projects/:id

# Get project logs
GET /api/projects/:id/logs?lines=100

# Refresh project status
POST /api/projects/:id/refresh
```

### Monitoring & Health

```bash
# Prometheus metrics
GET /api/monitoring/metrics

# System health
GET /api/monitoring/health

# System status with metrics
GET /api/monitoring/status

# Application logs
GET /api/monitoring/logs?service=api&level=error&limit=50

# Monitoring dashboard
GET /api/monitoring/dashboard
```

### Backup Management

```bash
# Backup status
GET /api/backup/status

# List available backups
GET /api/backup/list

# Create backup
POST /api/backup/create

# Export current state
GET /api/backup/export

# Cluster information
GET /api/backup/cluster-info

# Restore from backup (placeholder)
POST /api/backup/restore
{
  "timestamp": "2023-12-01T10-30-00-000Z"
}
```

### Webhooks

```bash
# JIRA webhook endpoint
POST /api/webhooks/jira

# Manual prompt trigger
POST /api/webhooks/trigger
{
  "projectId": "project-id",
  "prompt": "Review the latest commits"
}
```

## 🔍 Monitoring

### Metrics Available

The manager exposes Prometheus metrics at `/api/monitoring/metrics`:

- **HTTP Requests**: `http_requests_total`, `http_request_duration_seconds`
- **Projects**: `projects_total`, `project_operations_total`, `project_creation_duration_seconds`
- **Kubernetes**: `kubernetes_operations_total`, `kubernetes_resources_total`
- **Webhooks**: `webhook_requests_total`, `webhook_processing_duration_seconds`
- **Chat**: `chat_messages_total`, `active_chat_connections`
- **System**: `system_health_status`, `errors_total`

### Logging

Structured logs are written to multiple files:

- `logs/combined.log` - All log entries
- `logs/error.log` - Error-level entries only
- `logs/project-operations.log` - Project management operations
- `logs/webhooks.log` - Webhook processing events

### Alerting Rules

Prometheus alerting rules are configured for:

- Service downtime (>1 minute)
- High error rates (>5% for 5 minutes)
- Slow response times (>2s P95 for 5 minutes)  
- Project creation failures (<90% success rate)
- Memory usage warnings (>1GB)
- Webhook processing failures (>0.1 req/sec error rate)

## 🚨 Troubleshooting

### Common Issues

**Manager pod not starting:**
```bash
# Check pod status and logs
kubectl get pods -n claude-manager
kubectl logs deployment/claude-manager -n claude-manager

# Verify secrets exist
kubectl get secrets -n claude-manager
kubectl describe secret claude-manager-secrets -n claude-manager
```

**Projects not creating:**
```bash
# Check RBAC permissions
kubectl get clusterrolebinding claude-manager-binding
kubectl auth can-i create statefulsets --as=system:serviceaccount:claude-manager:claude-manager

# Check manager logs
kubectl logs deployment/claude-manager -n claude-manager | grep -i error
```

**Git backup failing:**
```bash
# Check backup status
curl http://localhost:3000/api/backup/status

# Check SSH key permissions (if using SSH)
kubectl exec deployment/claude-manager -n claude-manager -- ls -la /app/backup/.ssh/

# Manual backup test
curl -X POST http://localhost:3000/api/backup/create
```

**JIRA webhooks not working:**
```bash
# Check webhook logs
curl http://localhost:3000/api/monitoring/logs?service=webhook

# Test manual webhook
curl -X POST http://localhost:3000/api/webhooks/trigger \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test message"}'
```

### Log Analysis

```bash
# Get recent errors
kubectl logs deployment/claude-manager -n claude-manager | grep ERROR

# Follow real-time logs  
kubectl logs -f deployment/claude-manager -n claude-manager

# Get logs from specific service
curl "http://localhost:3000/api/monitoring/logs?service=kubernetes&level=error"
```

### Performance Tuning

```bash
# Increase resource limits
kubectl patch deployment claude-manager -n claude-manager -p '
{
  "spec": {
    "template": {
      "spec": {
        "containers": [{
          "name": "claude-manager",
          "resources": {
            "limits": {
              "memory": "2Gi", 
              "cpu": "2"
            }
          }
        }]
      }
    }
  }
}'

# Scale replicas (if using external database)
kubectl scale deployment claude-manager --replicas=2 -n claude-manager
```

## 🤝 Development

### Local Development

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Build TypeScript
npm run build

# Run production build
npm start

# Lint code
npm run lint

# Run tests
npm test
```

### Environment Setup

```bash
# Copy example environment file
cp .env.example .env

# Edit with your configuration
vim .env

# Start local development server
npm run dev
```

### Building Docker Image

```bash
# Build image
docker build -t claude-manager:latest .

# Test locally
docker run -p 3000:3000 \
  -e KUBERNETES_NAMESPACE=claude-manager \
  -e LOG_LEVEL=debug \
  claude-manager:latest
```

## 📄 License

MIT License - see the root LICENSE file for details.

## 🆘 Support

- **Logs**: Access via monitoring dashboard or API
- **Metrics**: Prometheus endpoint at `/api/monitoring/metrics`
- **Health Check**: `/api/monitoring/health`
- **Documentation**: This README and inline code comments

---

**Part of the Claude Code Development Environment Platform** 🚀