# 🚀 Cloud-based AI-Powered Development Environment

A comprehensive platform for running Claude Code development environments with two deployment options: simple Docker-based local development and enterprise Kubernetes production deployment.

## 🎯 Overview

This platform provides isolated development environments powered by Claude Code AI assistant, each running VS Code Server in containers with full development tooling and Git integration.

**Choose your deployment:**
- **[Local Development](localdev/)** - Simple Docker containers accessed via localhost ports
- **[Production](production/)** - Enterprise Kubernetes with centralized management

## 🏗️ Architecture Comparison

### Local Development (Docker)
```
localhost:8443  → Project 1 (VS Code)
localhost:8444  → Project 2 (VS Code)
localhost:8445  → Project 3 (VS Code)
```
- Port-based access
- Individual containers per project
- Simple script-based management
- Perfect for local development and testing

### Production (Kubernetes)
```
projects.internal/
├── manager/           → Central management dashboard
├── project1/          → Claude Code workspace 1
├── project2/          → Claude Code workspace 2
└── monitoring/        → Prometheus metrics & logs
```
- Centralized web management interface
- JIRA webhook integration
- Real-time chat with Claude instances
- Monitoring, logging, and automated backups
- StatefulSets with persistent storage

## 🚀 Quick Start

### Option 1: Local Development (Recommended for getting started)

```bash
cd localdev/

# Build the base image
cd image/
docker build -t claude-dev-env:latest .

# Create your first project
cd ../
./scripts/create-project.sh my-project https://github.com/your-org/repo.git

# Start the project
cd projects/my-project/
./start.sh

# Access at: http://localhost:8443
```

### Option 2: Production Deployment

```bash
cd production/

# Build production images
cd image/
docker build -t claude-dev-env-prod:latest .

cd ../manager/
docker build -t claude-manager:latest .

# Deploy to Kubernetes
cd ../kubernetes/
./deploy.sh

# Access dashboard at: http://localhost:3000 (after port-forward)
```

## 📁 Project Structure

```
cloud-based-AI-powered-development-environment/
├── localdev/                   # 🐳 Local Docker Development
│   ├── image/                  # Base container image
│   ├── docker-compose/         # Docker Compose templates
│   ├── scripts/                # Project management scripts
│   ├── projects/               # Individual project directories
│   └── README.md              # Local development guide
├── production/                 # 🏭 Production Kubernetes
│   ├── image/                  # Production container image
│   ├── manager/                # Central management application
│   ├── kubernetes/             # Core K8s manifests
│   ├── nginx-proxy/            # Reverse proxy
│   ├── monitoring/             # Prometheus & Grafana
│   └── README.md              # Production deployment guide
└── README.md                  # This file
```

## 🎯 Features

### 🐳 Local Development Features
- **Simple Setup**: Single command project creation
- **Port-based Access**: Each project on unique ports
- **Independent Containers**: Isolated environments per project
- **Script Management**: Easy start/stop/remove operations
- **Multi-project Support**: Run multiple projects simultaneously

### 🏭 Production Features
- **Centralized Management**: Web dashboard for all projects
- **Real-time Chat**: Send prompts to Claude Code instances
- **JIRA Integration**: Auto-create projects from tickets
- **Monitoring Dashboard**: Prometheus metrics and logging
- **Git Backup**: Automated Kubernetes state backup
- **StatefulSets**: Persistent storage with automatic PVC creation

### 🤖 Claude Code Integration (Both)
- **AI Assistant**: Full Claude Code capabilities in VS Code
- **Git Operations**: Automatic repository cloning and branch management
- **Multiple Auth Methods**: Token, SSH key, or public repository access
- **Development Tools**: Node.js, Python, Git pre-installed
- **Persistent Workspace**: Data survives container restarts

## 🔧 Configuration

Both deployment options support:

- **Git Authentication**: GitHub, GitLab, Bitbucket tokens or SSH keys
- **Claude API**: Your Anthropic API key for Claude Code
- **JIRA Integration**: Optional webhook integration for ticket automation
- **Custom Resources**: Configurable CPU, memory, and storage limits

## 🚨 When to Use What

### Use Local Development When:
- ✅ Getting started or testing
- ✅ Personal development projects
- ✅ Limited number of projects (1-5)
- ✅ Simple port-based access is sufficient
- ✅ No need for centralized management

### Use Production When:
- ✅ Team environments with multiple developers
- ✅ Many projects (5+) requiring management
- ✅ JIRA integration and automation needed
- ✅ Monitoring and logging requirements
- ✅ Centralized backup and disaster recovery
- ✅ Enterprise security and compliance needs

## 📚 Documentation

- **[Local Development Guide](localdev/README.md)** - Complete Docker-based setup
- **[Production Guide](production/README.md)** - Enterprise Kubernetes deployment
- **[Manager Documentation](production/manager/README.md)** - Central management API reference

## 🔐 Security

Both deployment options include:
- Container security with non-root users where possible
- Secret management for API keys and credentials
- Network isolation between projects
- Configurable resource limits and quotas

## 🐛 Troubleshooting

### Local Development
```bash
# Check project status
./scripts/list-projects.sh

# View logs
cd projects/my-project/
./logs.sh

# Restart project
./stop.sh && ./start.sh
```

### Production
```bash
# Check manager status
kubectl get pods -n claude-manager

# View manager logs
kubectl logs deployment/claude-manager -n claude-manager

# Check project status via API
curl http://localhost:3000/api/projects
```

## 🤝 Contributing

1. Fork the repository
2. Choose your development approach (localdev for testing, production for integration)
3. Create your feature branch
4. Test thoroughly with your chosen deployment method
5. Submit a pull request

## 📄 License

MIT License - see the LICENSE file for details.

---

**🎯 Start with [Local Development](localdev/) for quick setup, graduate to [Production](production/) for enterprise use.**