# 🏭 Production Kubernetes Environment

Enterprise-grade Kubernetes deployment with centralized management, monitoring, and automated project orchestration.

## 🏗️ Architecture

```
Production Environment
├── Claude Manager          → Central management application
│   ├── Web Interface       → Project management UI
│   ├── REST API           → Project CRUD operations  
│   ├── WebSocket Chat     → Real-time Claude Code communication
│   ├── JIRA Webhooks      → Auto-project creation
│   ├── Git Backup         → State backup to repository
│   └── Monitoring         → Prometheus metrics & logs
├── Nginx Proxy            → Unified project access
├── Projects               → Claude Code environments (StatefulSets)
├── Monitoring Stack       → Prometheus, Grafana, Alertmanager
└── Backup System          → Git-based Kubernetes state backup
```

## 🚀 Quick Start

### Prerequisites
- Kubernetes cluster (1.20+)
- kubectl configured
- Helm 3+ (for monitoring stack)
- Git repository for backups

### 1. Deploy Production Environment

```bash
cd production/

# Build manager image
cd manager/
docker build -t claude-manager:latest .

# Configure secrets
kubectl create namespace claude-manager
kubectl create secret generic claude-manager-secrets \
  --from-literal=jira-api-key="your-jira-api-key" \
  --from-literal=default-anthropic-api-key="your-anthropic-key" \
  --from-literal=backup-git-token="your-github-token" \
  --from-literal=jwt-secret="your-jwt-secret" \
  --from-literal=webhook-secret="your-webhook-secret" \
  -n claude-manager

# Deploy everything
cd kubernetes/
./deploy.sh
```

### 2. Access the Management Interface

```bash
# Port forward to access locally
kubectl port-forward svc/claude-manager-service 3000:3000 -n claude-manager

# Access at: http://localhost:3000
```

## 📊 Features

### 🎛️ Centralized Management
- **Web Dashboard**: Create, manage, and monitor all projects
- **REST API**: Programmatic project management
- **Real-time Chat**: Send prompts to any Claude Code instance
- **Status Monitoring**: Live project health and resource usage

### 🤖 Automated Operations
- **JIRA Integration**: Auto-create projects from tickets
- **Git Backup**: Automated Kubernetes state backup to Git
- **Health Monitoring**: Automatic restart of failed projects
- **Resource Scaling**: Dynamic resource allocation

### 🔧 Enterprise Features
- **Single Namespace**: Simplified RBAC and resource management
- **StatefulSets**: Persistent storage with automatic PVC creation
- **Configurable Storage**: Custom storage classes and sizes
- **SSH Key Support**: Secure Git authentication
- **Structured Backups**: Kustomize-organized for easy restoration

## 🗂️ Directory Structure

```
production/
├── image/                   # Production container image
│   ├── scripts/            # Container startup and utility scripts
│   ├── Dockerfile         # Production-optimized container
│   └── README.md          # Image documentation
├── manager/                 # Central management application
│   ├── src/                # TypeScript source code
│   ├── public/             # Web interface
│   ├── kubernetes/         # Manager deployment manifests
│   ├── Dockerfile
│   └── README.md          # Detailed manager documentation
├── kubernetes/             # Core Kubernetes manifests
│   ├── base/              # Base configurations
│   ├── overlays/          # Environment-specific configs
│   └── deploy.sh          # Deployment script
├── nginx-proxy/            # Nginx reverse proxy
│   ├── config/            # Nginx configurations
│   └── kubernetes/        # Nginx deployment manifests
├── monitoring/             # Monitoring stack
│   ├── prometheus/        # Prometheus configuration
│   ├── grafana/          # Grafana dashboards
│   └── alertmanager/     # Alert configurations
└── README.md              # This file
```

## 🔗 Component Documentation

- **[Production Image](image/README.md)** - Container image with production features
- **[Manager Application](manager/README.md)** - Central management system
- **[Kubernetes Deployment](kubernetes/README.md)** - Core K8s manifests
- **[Nginx Proxy](nginx-proxy/README.md)** - Reverse proxy configuration
- **[Monitoring](monitoring/README.md)** - Observability stack

## ⚙️ Configuration

### Environment Variables

```bash
# Core settings
KUBERNETES_NAMESPACE=claude-manager
DEFAULT_STORAGE_CLASS=fast-ssd
DEFAULT_WORKSPACE_SIZE=20Gi

# JIRA integration
JIRA_BASE_URL=https://company.atlassian.net
AUTO_CREATE_PROJECTS=true

# Backup configuration  
BACKUP_GIT_REPOSITORY=git@github.com:org/k8s-backups.git
BACKUP_INTERVAL_HOURS=24

# Frontend
PROJECTS_DOMAIN=projects.internal
```

### Kubernetes Secrets

```yaml
# claude-manager-secrets
data:
  jira-api-key: <base64>
  default-anthropic-api-key: <base64>
  backup-git-token: <base64>
  jwt-secret: <base64>
  webhook-secret: <base64>
```

## 🚨 Troubleshooting

### Manager Not Starting

```bash
kubectl get pods -n claude-manager
kubectl logs deployment/claude-manager -n claude-manager
kubectl describe deployment claude-manager -n claude-manager
```

### Projects Not Creating

```bash
# Check RBAC permissions
kubectl auth can-i create statefulsets --as=system:serviceaccount:claude-manager:claude-manager

# Check manager logs
kubectl logs deployment/claude-manager -n claude-manager | grep -i error
```

### Backup Issues

```bash
# Check backup status
kubectl exec deployment/claude-manager -n claude-manager -- curl http://localhost:3000/api/backup/status

# Manual backup test
kubectl exec deployment/claude-manager -n claude-manager -- curl -X POST http://localhost:3000/api/backup/create
```

## 📈 Monitoring

### Metrics Available
- HTTP requests and response times
- Project operations and status
- Kubernetes resource usage
- Backup success/failure rates
- Chat message volume

### Dashboards
- **Manager Dashboard**: http://localhost:3000/api/monitoring/dashboard
- **Prometheus**: http://localhost:9090 (if exposed)
- **Grafana**: http://localhost:3001 (if deployed)

## 🔄 Backup & Recovery

### Automated Backups
- Scheduled backups every 24 hours
- Git-based storage with Kustomize structure
- SSH key or token authentication

### Manual Backup
```bash
curl -X POST http://localhost:3000/api/backup/create
```

### Restoration
```bash
# From backup repository
kubectl apply -k .
```

## 🔐 Security

- **RBAC**: Minimal permissions for manager service account
- **Network Policies**: Isolated project networks
- **Secrets Management**: Encrypted secret storage
- **SSH Keys**: Secure Git authentication
- **Container Security**: Non-privileged containers where possible

---

**For local development, see the `localdev/` directory.**