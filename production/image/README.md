# 🐳 Production Claude Code Image

Production-ready container image for Claude Code development environments with enhanced security, monitoring, and Kubernetes integration.

## 🏗️ Features

### Production Enhancements
- **Multi-user Support**: Proper coder user with non-root execution
- **Enhanced Security**: Minimal privileges and security contexts
- **Health Monitoring**: Built-in health checks and service monitoring
- **Kubernetes Tools**: kubectl and Docker CLI for container operations
- **Advanced Git Support**: SSH keys, tokens, and multiple providers
- **Production Logging**: Structured logging with log rotation

### Development Tools
- **VS Code Server**: Latest version with full extension support
- **Claude Code**: Latest AI assistant with JIRA MCP integration
- **Node.js 20**: Latest LTS with TypeScript and development tools
- **AgentAPI**: HTTP API for remote Claude Code control
- **Build Tools**: Python 3, build-essential, and common utilities

## 🚀 Building the Image

```bash
cd production/image/

# Build the production image
docker build -t claude-dev-env-prod:latest .

# Build with specific tag
docker build -t your-registry/claude-dev-env:v1.0.0 .

# Push to registry
docker push your-registry/claude-dev-env:v1.0.0
```

## 🔧 Configuration

### Environment Variables

#### Required
```bash
ANTHROPIC_API_KEY=sk-ant-your-api-key        # Claude Code API key
SUDO_PASSWORD=sudo-password                  # Container sudo password
# Note: VS Code authentication is handled by nginx-sso proxy in production
```

#### Git Configuration
```bash
GIT_REPOSITORY=https://github.com/org/repo.git    # Repository to clone
GIT_AUTH_TYPE=token|ssh-key|none                  # Authentication method

# For token authentication
GIT_TOKEN=your-git-token

# For SSH key authentication  
SSH_PRIVATE_KEY=base64-encoded-private-key
SSH_PUBLIC_KEY=base64-encoded-public-key

# Git user configuration
GIT_USER_NAME=Claude Code Bot
GIT_USER_EMAIL=claude@cluster.local
```

#### JIRA Integration
```bash
JIRA_BASE_URL=https://company.atlassian.net      # JIRA instance URL
JIRA_EMAIL=user@company.com                      # JIRA user email
JIRA_API_KEY=your-jira-api-key                   # JIRA API token
```

#### Production Settings
```bash
NODE_ENV=production                              # Environment mode
PROJECT_NAME=My Project                          # Project display name
LOG_LEVEL=info                                   # Logging level
```

## 🔐 Security Features

### User Security
- Runs as non-root `coder` user
- Proper file permissions and ownership
- SSH key handling with secure permissions
- Credential storage outside container filesystem

### Network Security
- Minimal exposed ports (8443, 3284, 3000)
- Health check endpoints
- No unnecessary services running

### Container Security
- Uses official base images
- Minimal package installation
- Regular security updates in base image

## 🏥 Health Monitoring

### Built-in Health Check
The image includes a comprehensive health check script:

```bash
# Manual health check
docker exec container-name /usr/local/bin/healthcheck.sh
```

### Monitored Services
- **Code-server**: VS Code web interface
- **AgentAPI**: Claude Code HTTP API
- **Workspace**: File system accessibility
- **Memory/Disk**: Resource utilization

### Kubernetes Readiness
- Readiness probe: `/usr/local/bin/healthcheck.sh`
- Liveness probe: HTTP check on port 8443
- Startup probe: Extended timeout for initialization

## 📁 Directory Structure

```
/workspace          # Project files and code
/config            # VS Code and application configuration
/home/coder        # User home directory with .ssh, .git-credentials
/var/log           # Application logs
  ├── startup.log      # Container startup logs
  ├── code-server.log  # VS Code server logs
  ├── agentapi.log     # Claude Code API logs
  └── dev-server.log   # Development server logs (if enabled)
```

## 🔧 Advanced Usage

### SSH Key Authentication

Mount SSH keys as secrets in Kubernetes:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: git-ssh-keys
type: Opaque
data:
  private-key: <base64-encoded-private-key>
  public-key: <base64-encoded-public-key>

---
# In deployment:
env:
- name: SSH_PRIVATE_KEY
  valueFrom:
    secretKeyRef:
      name: git-ssh-keys
      key: private-key
- name: SSH_PUBLIC_KEY
  valueFrom:
    secretKeyRef:
      name: git-ssh-keys
      key: public-key
```

### Custom Startup Commands

Extend the startup process by mounting custom scripts:

```yaml
volumeMounts:
- name: custom-startup
  mountPath: /usr/local/bin/custom-startup.sh
  subPath: custom-startup.sh
```

### Development Server

Enable development server for Node.js projects:

```bash
NODE_ENV=development    # Enables dev server startup
```

## 🐛 Troubleshooting

### Common Issues

**Container won't start:**
```bash
# Check logs
docker logs container-name

# Check health
docker exec container-name /usr/local/bin/healthcheck.sh
```

**Git authentication fails:**
```bash
# Check SSH key permissions
docker exec container-name ls -la /home/coder/.ssh/

# Test Git access
docker exec container-name sudo -u coder git ls-remote origin
```

**Claude Code API not responding:**
```bash
# Check AgentAPI logs
docker exec container-name tail -f /var/log/agentapi.log

# Test API endpoint
curl http://container-ip:3284/health
```

### Log Analysis

```bash
# All startup logs
docker exec container-name tail -f /var/log/startup.log

# Service-specific logs
docker exec container-name tail -f /var/log/code-server.log
docker exec container-name tail -f /var/log/agentapi.log
```

## 🔄 Image Updates

### Version Management
- Tag images with semantic versions
- Keep previous versions for rollback
- Test new images thoroughly before deployment

### Update Process
1. Build new image with updated tag
2. Update Kubernetes deployments
3. Monitor rollout and health checks
4. Rollback if issues detected

## 📊 Monitoring Integration

### Prometheus Metrics
- Container resource usage
- Service availability
- Git operation success/failure
- Claude Code API response times

### Log Aggregation
- Structured JSON logging
- Integration with ELK stack
- Log retention policies
- Error alerting

---

**Optimized for production Kubernetes deployments with enterprise security and monitoring requirements.**