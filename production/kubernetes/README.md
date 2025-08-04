# Kubernetes Multi-Project Deployment Guide

This directory contains the base Kustomize configuration and tools for deploying multiple Claude Code development environments, each tailored for specific projects and Git authentication methods.

## 📁 Directory Structure

```
kubernetes/
├── base/                          # Base Kustomize configuration
│   ├── configmap.yaml            # Base ConfigMap
│   ├── deployment.yaml           # Base Deployment
│   ├── kustomization.yaml        # Base Kustomization
│   ├── namespace.yaml            # Base Namespace
│   ├── pvc.yaml                  # Persistent Volume Claims
│   ├── secret.yaml               # Secret template
│   └── service.yaml              # Service definitions
├── overlays/
│   └── examples/                 # Example project configurations
│       ├── github-token/         # GitHub with token auth
│       ├── gitlab-token/         # GitLab with token auth
│       ├── bitbucket-token/      # Bitbucket with app password
│       ├── ssh-key/              # Any provider with SSH key
│       └── public-repo/          # Public repository (no auth)
├── create-project.sh             # Project instance generator script
└── deploy.sh                     # Single instance deployment script
```

## 🚀 Quick Start

### Option 1: Using the Project Generator Script (Recommended)

The `create-project.sh` script automatically generates project-specific configurations:

```bash
# GitHub with token authentication
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

# GitLab with SSH key authentication
./create-project.sh \
  --name myproject-gitlab \
  --repo git@gitlab.com:myorg/myproject.git \
  --provider gitlab \
  --auth ssh-key \
  --anthropic-key "your-anthropic-api-key" \
  --code-password "your-secure-password" \
  --sudo-password "your-sudo-password" \
  --ssh-private-key ~/.ssh/id_rsa \
  --ssh-public-key ~/.ssh/id_rsa.pub \
  --deploy

# Public repository (no authentication)
./create-project.sh \
  --name openai-python \
  --repo https://github.com/openai/openai-python.git \
  --provider github \
  --auth none \
  --anthropic-key "your-anthropic-api-key" \
  --code-password "your-secure-password" \
  --sudo-password "your-sudo-password" \
  --deploy
```

### Option 2: Manual Configuration

Copy and customize one of the example overlays:

```bash
# Copy an example
cp -r overlays/examples/github-token overlays/myproject

# Edit the configuration
cd overlays/myproject
vim kustomization.yaml
vim project-patches.yaml

# Deploy
kubectl apply -k .
```

## 🔐 Supported Authentication Methods

### 1. Token Authentication

**Supported Providers**: GitHub, GitLab, Bitbucket

- **GitHub**: Personal Access Token or GitHub App token
- **GitLab**: Personal Access Token or Deploy Token
- **Bitbucket**: App Password

```bash
./create-project.sh \
  --name myproject \
  --repo https://github.com/myorg/myproject.git \
  --provider github \
  --auth token \
  --git-token "ghp_xxxxxxxxxxxx" \
  # ... other options
```

### 2. SSH Key Authentication

**Supported Providers**: Any Git provider supporting SSH

```bash
# Generate SSH key if needed
ssh-keygen -t ed25519 -C "your-email@example.com" -f ~/.ssh/claude_dev_key

# Add public key to your Git provider
# GitHub: Settings → SSH and GPG keys
# GitLab: Preferences → SSH Keys
# Bitbucket: Personal settings → SSH keys

./create-project.sh \
  --name myproject \
  --repo git@github.com:myorg/myproject.git \
  --provider github \
  --auth ssh-key \
  --ssh-private-key ~/.ssh/claude_dev_key \
  --ssh-public-key ~/.ssh/claude_dev_key.pub \
  # ... other options
```

### 3. No Authentication (Public Repositories)

**Supported Providers**: Any provider with public repositories

```bash
./create-project.sh \
  --name public-project \
  --repo https://github.com/openai/openai-python.git \
  --provider github \
  --auth none \
  # ... other options (no git-token needed)
```

## 📋 Script Options

### Required Options

| Option | Description | Example |
|--------|-------------|---------|
| `--name` | Project name (used for namespace and resource names) | `myproject` |
| `--repo` | Git repository URL | `https://github.com/org/repo.git` |
| `--provider` | Git provider: `github`, `gitlab`, `bitbucket` | `github` |
| `--auth` | Authentication method: `token`, `ssh-key`, `none` | `token` |
| `--anthropic-key` | Anthropic API key for Claude Code | `sk-ant-...` |
| `--code-password` | VS Code server password | `secure-password` |
| `--sudo-password` | Container sudo password | `sudo-password` |

### Authentication-Specific Options

| Option | Required For | Description |
|--------|--------------|-------------|
| `--git-token` | `token` auth | Git access token/app password |
| `--ssh-private-key` | `ssh-key` auth | Path to SSH private key file |
| `--ssh-public-key` | `ssh-key` auth | Path to SSH public key file |

### Optional Options

| Option | Description | Default |
|--------|-------------|---------|
| `--jira-url` | JIRA base URL | None |
| `--jira-email` | JIRA email | None |
| `--jira-key` | JIRA API key | None |
| `--nodeport-base` | Base NodePort (30000-32767) | Random |
| `--deploy` | Deploy immediately after creation | False |

## 🌐 Accessing Your Environments

Each project gets its own namespace and ports:

### Using Port Forwarding (Recommended)

```bash
# Forward ports for specific project
kubectl port-forward svc/myproject-claude-dev-env-service 8443:8443 -n claude-dev-myproject

# Access at http://localhost:8443
```

### Using NodePort

Each project gets unique NodePorts (automatically assigned or specified):

```bash
# Get node IP
kubectl get nodes -o wide

# Access using NodePort
# VS Code: http://node-ip:nodeport-base+443
# AgentAPI: http://node-ip:nodeport-base+284
# Dev Server: http://node-ip:nodeport-base+0
```

## 🔧 Customizing Projects

### Modifying Resource Limits

Edit `project-patches.yaml` in your project overlay:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-dev-env
spec:
  template:
    spec:
      containers:
      - name: claude-dev-env
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "8Gi"
            cpu: "4"
```

### Adding Custom Environment Variables

```yaml
        env:
        - name: CUSTOM_VAR
          value: "custom-value"
        - name: SECRET_VAR
          valueFrom:
            secretKeyRef:
              name: my-custom-secret
              key: secret-key
```

### Using Custom Storage Classes

Modify the PVC in your overlay:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: claude-dev-workspace
spec:
  storageClassName: your-custom-storage-class
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi
```

## 🔍 Troubleshooting

### Check Project Status

```bash
# List all Claude Code projects
kubectl get namespaces -l managed-by=kustomize

# Check specific project
kubectl get all -n claude-dev-myproject

# Check pod logs
kubectl logs deployment/myproject-claude-dev-env -n claude-dev-myproject
```

### Common Issues

1. **SSH Key Permission Issues**
   ```bash
   chmod 600 /path/to/private-key
   chmod 644 /path/to/public-key
   ```

2. **NodePort Conflicts**
   - Use `--nodeport-base` to specify different port ranges
   - Check existing services: `kubectl get svc --all-namespaces`

3. **Storage Issues**
   - Check PVC status: `kubectl get pvc -n your-namespace`
   - Verify storage class availability: `kubectl get storageclass`

### Clean Up Projects

```bash
# Delete specific project
kubectl delete namespace claude-dev-myproject

# Delete project overlay
rm -rf overlays/myproject
```

## 🚀 Production Tips

1. **Use proper storage classes** with backup and high performance
2. **Set resource limits** appropriate for your workload
3. **Configure ingress** instead of NodePort for external access
4. **Use external secrets management** (e.g., External Secrets Operator)
5. **Monitor resources** with Prometheus and Grafana
6. **Set up log aggregation** for centralized logging

## 📚 Examples

See the `overlays/examples/` directory for complete working examples of different authentication methods and Git providers.