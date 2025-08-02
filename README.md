# Claude Code Containerized Development Environment

A complete containerized development environment featuring VS Code in the browser, Claude Code AI assistant, JIRA integration, and remote API triggering capabilities. Deploy with Docker Compose or Kubernetes.

## 🏗️ Architecture

```
Browser → code-server (VS Code) → Container (Docker/K8s)
                ↓
    Claude Code + JIRA MCP + Git
                ↓
    AgentAPI (HTTP endpoints for remote control)
                ↓
    JIRA Webhooks → Trigger Claude Code tasks
```

## 📁 Project Structure

```
claude-based-AI-powered-development-environment/
├── image/                     # Container image files
│   ├── Dockerfile            # Container configuration
│   └── scripts/              # Container startup scripts
│       ├── startup.sh        # Main startup script
│       └── setup-git.sh      # Git configuration script
├── docker-compose/           # Docker Compose deployment
│   └── docker-compose.yml    # Service orchestration
├── kubernetes/               # Kubernetes deployment & multi-project support
│   ├── base/                 # Base Kustomize configuration
│   │   ├── deployment.yaml   # Base deployment
│   │   ├── service.yaml      # Base service definitions
│   │   ├── configmap.yaml    # Base configuration
│   │   ├── secret.yaml       # Base secret template
│   │   ├── pvc.yaml          # Persistent volume claims
│   │   ├── namespace.yaml    # Base namespace
│   │   └── kustomization.yaml # Base Kustomize config
│   ├── overlays/             # Project-specific overlays
│   │   └── examples/         # Example configurations
│   │       ├── github-token/ # GitHub with token auth
│   │       ├── gitlab-token/ # GitLab with token auth
│   │       ├── ssh-key/      # SSH key authentication
│   │       ├── bitbucket-token/ # Bitbucket app password
│   │       └── public-repo/  # Public repository (no auth)
│   ├── webhook-service/      # Centralized webhook routing
│   │   ├── deployment.yaml   # Webhook service deployment
│   │   ├── service.yaml      # Webhook service exposure
│   │   ├── configmap.yaml    # Webhook routing configuration
│   │   ├── kustomization.yaml # Webhook service Kustomize
│   │   ├── namespace.yaml    # Webhook service namespace
│   │   └── deploy.sh         # Webhook service deployment script
│   ├── create-project.sh     # Multi-project instance generator
│   ├── update-webhook-routing.sh # Add projects to webhook routing
│   ├── deploy.sh             # Single instance deployment
│   └── README.md             # Kubernetes deployment guide
├── webhook-service/          # Centralized webhook routing service
│   ├── app/                  # Application code
│   │   └── webhook_router.py # Smart webhook router with project routing
│   ├── config/               # Configuration files
│   │   └── routing.yaml      # Webhook routing configuration
│   ├── Dockerfile            # Webhook service container
│   ├── requirements.txt      # Python dependencies
│   └── README.md             # Webhook service documentation
├── .env.example              # Environment variables template
├── requirements.txt          # Python dependencies (legacy)
├── webhook_handler.py        # JIRA webhook integration (legacy)
├── workspace/                # Your project workspace
├── config/                   # code-server configuration
└── .claude/
    └── commands/             # Custom Claude commands
```

## 🚀 Deployment Options

Choose your preferred deployment method:

### Option 1: Docker Compose (Recommended for local development)

<details>
<summary>Click to expand Docker Compose instructions</summary>

#### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd cloud-based-AI-powered-development-environment

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your API keys and settings
```

#### 2. Configure Environment Variables

Edit `.env` file with your credentials:

```bash
# Required: Your Anthropic API key for Claude Code
ANTHROPIC_API_KEY=your-api-key-here

# Git configuration
GIT_REPO=https://github.com/your-org/your-project.git
GIT_TOKEN=your-github-token

# JIRA Integration
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_KEY=your-jira-api-key

# Container access
CODE_SERVER_PASSWORD=your-secure-password
```

#### 3. Start the Environment

```bash
cd docker-compose

# Build and start the container
docker-compose up -d

# Optional: Start webhook handler for remote triggering
cd ..
python3 webhook_handler.py
```

#### 4. Access Points

- **VS Code in Browser**: http://localhost:8443
- **AgentAPI Documentation**: http://localhost:3284/docs
- **Webhook Handler**: http://localhost:5000 (if running)

</details>

### Option 2: Kubernetes (Recommended for production)

<details>
<summary>Click to expand Kubernetes instructions</summary>

#### Prerequisites

- Kubernetes cluster (1.19+)
- kubectl configured
- Container registry access (optional, for custom images)

#### Single Project Deployment

For deploying a single instance:

```bash
cd kubernetes

# Edit base/configmap.yaml with your settings
vim base/configmap.yaml

# Create secrets with your credentials
kubectl create secret generic claude-dev-secrets -n claude-dev \
  --from-literal=anthropic-api-key="your-api-key" \
  --from-literal=code-server-password="your-password" \
  --from-literal=sudo-password="your-sudo-password" \
  --from-literal=git-token="your-git-token" \
  --from-literal=jira-api-key="your-jira-api-key"

# Deploy using base configuration
kubectl apply -k base/
```

#### Multi-Project Deployment

For deploying multiple project instances with different Git repositories and authentication:

```bash
cd kubernetes

# Use the project generator script
./create-project.sh \
  --name myproject \
  --repo https://github.com/myorg/myproject.git \
  --provider github \
  --auth token \
  --anthropic-key "your-anthropic-api-key" \
  --code-password "your-secure-password" \
  --sudo-password "your-sudo-password" \
  --git-token "your-github-token" \
  --deploy

# This creates a new overlay in overlays/myproject/ and deploys it
```

#### Supported Authentication Methods

- **Token Authentication**: GitHub, GitLab, Bitbucket tokens
- **SSH Key Authentication**: Works with any Git provider
- **No Authentication**: For public repositories

#### Examples

```bash
# GitHub with token
./create-project.sh --name proj1 --repo https://github.com/org/repo.git --provider github --auth token --git-token "ghp_xxx" [other-options]

# GitLab with SSH key
./create-project.sh --name proj2 --repo git@gitlab.com:org/repo.git --provider gitlab --auth ssh-key --ssh-private-key ~/.ssh/id_rsa --ssh-public-key ~/.ssh/id_rsa.pub [other-options]

# Public repository
./create-project.sh --name proj3 --repo https://github.com/openai/openai-python.git --provider github --auth none [other-options]
```

#### Access Your Environment

```bash
# Using port forwarding (recommended)
kubectl port-forward svc/myproject-claude-dev-env-service 8443:8443 -n claude-dev-myproject

# Access at: http://localhost:8443
```

See `kubernetes/README.md` for detailed multi-project deployment instructions.

</details>

## 🤖 Using Claude Code

### In VS Code Terminal

```bash
cd /workspace

# Start Claude Code interactive session
claude

# Claude will have access to:
# - Your project files
# - JIRA integration via MCP
# - Git operations
# - All development tools
```

### Remote API Triggering

```bash
# Trigger Claude Code remotely
curl -X POST http://localhost:5000/trigger-claude \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Review the latest commits and create a summary of changes"
  }'

# Check Claude Code status
curl http://localhost:5000/claude-status
```

## 🎯 JIRA Integration with Smart Routing

### Automatic Workflow

1. **JIRA ticket created/updated** → Webhook sent to centralized router
2. **Webhook service** → Routes to appropriate Claude Code instance based on project
3. **Claude analyzes ticket** → Creates feature branch in correct repository
4. **Sets up project structure** → Begins implementation
5. **Updates CLAUDE.md** → Documents progress

### Centralized Webhook Setup

#### 1. Deploy Webhook Service

```bash
cd kubernetes/webhook-service
./deploy.sh
```

#### 2. Configure Project Routing

```bash
# Add routing for your projects
cd kubernetes
./update-webhook-routing.sh \
  --name myproject \
  --namespace claude-dev-myproject \
  --jira-projects "MYPROJ,PROJ-*"
```

#### 3. Configure JIRA Automation

1. Go to **Project Settings** → **Automation**
2. Create rule with trigger: **Issue created/updated**
3. Add action: **Send web request**
   - URL: `http://your-webhook-service/jira-webhook`
   - Method: POST
   - Headers: `Content-Type: application/json`

### Smart Routing Features

- **Project-based routing**: Routes tickets based on JIRA project keys
- **Pattern matching**: Supports wildcards (`PROJ-*`) for flexible routing
- **Catch-all fallback**: Unmatched projects go to default instance
- **Multiple event types**: Handles created, updated, assigned events
- **Health monitoring**: Check status of all Claude instances

## 🛠️ Features

### Development Environment
- ✅ VS Code in browser with full functionality
- ✅ Pre-installed Node.js 20, Python 3, Git
- ✅ Claude Code AI assistant with full capabilities
- ✅ Persistent workspace and configuration
- ✅ Multiple port exposure for development servers

### AI Integration
- ✅ Claude Code with JIRA MCP integration
- ✅ Automated task creation from JIRA tickets
- ✅ Intelligent branch management
- ✅ Code analysis and implementation assistance

### Remote Control & Webhook Routing
- ✅ Centralized webhook service for JIRA integration
- ✅ Smart routing based on JIRA project keys
- ✅ Pattern matching and catch-all fallback
- ✅ HTTP API for manual Claude triggering
- ✅ Status monitoring across all instances
- ✅ Hot configuration reloading

### Deployment Flexibility
- ✅ Docker Compose for local development
- ✅ Kubernetes for production workloads
- ✅ Multi-project support with Kustomize overlays
- ✅ Multiple Git authentication methods (token, SSH, public)
- ✅ Support for GitHub, GitLab, Bitbucket
- ✅ Persistent storage for workspace and config
- ✅ Scalable and cloud-ready architecture

## 🔧 Advanced Configuration

### Custom Claude Commands

Create project-specific templates in `.claude/commands/`:

```markdown
---
name: Setup JIRA Task
description: Create branch and setup for JIRA task
---

Create a new branch for JIRA task {{ticket_key}}:

1. Fetch latest from main
2. Create branch: feature/{{ticket_key}}
3. Update CLAUDE.md with task details
4. Set up initial file structure
5. Create development plan
```

### Environment Customization

Add additional tools or configurations by modifying `image/Dockerfile`:

```dockerfile
# Install additional tools
RUN apt-get update && apt-get install -y \
    your-additional-tool \
    && rm -rf /var/lib/apt/lists/*
```

### Kubernetes Resource Limits

Modify `kubernetes/deployment.yaml` to adjust resource allocation:

```yaml
resources:
  requests:
    memory: "2Gi"
    cpu: "1"
  limits:
    memory: "8Gi"
    cpu: "4"
```

## 🔐 Security Considerations

- 🔒 Use strong passwords for code-server access
- 🔒 Store secrets in Kubernetes secrets or Docker secrets
- 🔒 Consider VPN access for remote environments
- 🔒 Regular container updates recommended
- 🔒 Limit network exposure of AgentAPI port
- 🔒 Use RBAC in Kubernetes for access control

## 🐛 Troubleshooting

### Common Issues

| Issue | Docker Compose Solution | Kubernetes Solution |
|-------|------------------------|-------------------|
| Claude Code won't start | Check `ANTHROPIC_API_KEY` in .env | Check secret: `kubectl get secret claude-dev-secrets -n claude-dev` |
| JIRA MCP not working | Verify JIRA credentials in .env | Check configmap and secrets |
| Git clone fails | Check `GIT_TOKEN` permissions | Verify git-token in secrets |
| AgentAPI not responding | Ensure port 3284 is available | Check service and pod status |

### Docker Compose Logs

```bash
cd docker-compose

# Container logs
docker-compose logs -f

# AgentAPI logs
docker exec -it claude-dev-env tail -f /var/log/agentapi.log

# code-server logs
docker exec -it claude-dev-env tail -f /config/logs/code-server.log
```

### Kubernetes Logs

```bash
# Pod logs
kubectl logs -f deployment/claude-dev-env -n claude-dev

# Check pod status
kubectl get pods -n claude-dev

# Describe pod for detailed information
kubectl describe pod <pod-name> -n claude-dev

# Check persistent volumes
kubectl get pv,pvc -n claude-dev
```

## 📚 API Reference

### Webhook Endpoints

- `POST /jira-webhook` - JIRA automation webhook
- `POST /trigger-claude` - Manual Claude Code triggering
- `GET /claude-status` - Health check and status

### Example Payloads

```json
{
  "prompt": "Analyze the codebase and suggest performance improvements"
}
```

## 🚀 Production Deployment Tips

### For Kubernetes

1. **Use a proper ingress controller** for external access
2. **Set up monitoring** with Prometheus and Grafana
3. **Configure backup** for persistent volumes
4. **Use network policies** for security
5. **Set up log aggregation** with ELK or similar

### Example Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: claude-dev-ingress
  namespace: claude-dev
spec:
  rules:
  - host: claude-dev.your-domain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: claude-dev-env-service
            port:
              number: 8443
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Test with both Docker Compose and Kubernetes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Built with ❤️ for AI-powered development workflows**