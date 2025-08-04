# 🐳 Local Development Environment

Simple Docker-based solution for running Claude Code development environments locally. Each project runs in its own container with port-based access.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Git

### 1. Build the Base Image

```bash
cd image/
docker build -t claude-dev-env:latest .
```

### 2. Create a New Project

```bash
# Create project directory
mkdir projects/my-project

# Copy project template
cp docker-compose/docker-compose.project.yml projects/my-project/docker-compose.yml

# Edit the configuration
cd projects/my-project
vim docker-compose.yml
```

### 3. Configure Project

Edit the `docker-compose.yml` file:

```yaml
services:
  claude-dev:
    environment:
      - GIT_REPOSITORY=https://github.com/your-org/your-repo.git
      - ANTHROPIC_API_KEY=your-api-key
      - CODE_SERVER_PASSWORD=your-password
      - SUDO_PASSWORD=your-sudo-password
    ports:
      - "8443:8443"  # VS Code Server
      - "3284:3284"  # Claude Agent API
      - "3000:3000"  # Development server
```

### 4. Start the Project

```bash
docker-compose up -d
```

### 5. Access Your Project

- **VS Code**: http://localhost:8443
- **Claude Agent API**: http://localhost:3284
- **Dev Server**: http://localhost:3000

## 📁 Directory Structure

```
localdev/
├── image/                    # Base Docker image
│   ├── Dockerfile
│   └── entrypoint.sh
├── config/                   # Configuration templates
│   └── settings.json.template
├── docker-compose/           # Docker Compose templates
│   ├── docker-compose.project.yml
│   └── docker-compose.multi.yml
├── scripts/                  # Management scripts
│   ├── create-project.sh
│   ├── list-projects.sh
│   ├── start-project.sh
│   ├── stop-project.sh
│   └── remove-project.sh
├── projects/                 # Individual project directories
│   ├── project1/
│   │   ├── docker-compose.yml
│   │   └── .env
│   └── project2/
│       ├── docker-compose.yml
│       └── .env
└── README.md                 # This file
```

## 🛠️ Project Management

### Create a New Project

```bash
./scripts/create-project.sh my-new-project https://github.com/org/repo.git
```

### List All Projects

```bash
./scripts/list-projects.sh
```

### Start/Stop Projects

```bash
# Start a project
./scripts/start-project.sh my-project

# Stop a project
./scripts/stop-project.sh my-project

# Remove a project (with confirmation)
./scripts/remove-project.sh my-project
```

### Multi-Project Setup

For running multiple projects simultaneously:

```bash
# Copy multi-project template
cp docker-compose/docker-compose.multi.yml docker-compose.yml

# Edit to add your projects
vim docker-compose.yml

# Start all projects
docker-compose up -d
```

## 🔧 Configuration

### Environment Variables

Each project can be configured with:

```bash
# Git repository
GIT_REPOSITORY=https://github.com/your-org/repo.git
GIT_AUTH_TYPE=token|ssh-key|none
GIT_TOKEN=your-github-token  # if using token auth

# Claude Code configuration
ANTHROPIC_API_KEY=sk-ant-...
CODE_SERVER_PASSWORD=secure-password
SUDO_PASSWORD=sudo-password
PROJECT_NAME=My Project

# JIRA integration (optional)
JIRA_BASE_URL=https://company.atlassian.net
JIRA_EMAIL=user@company.com
JIRA_API_KEY=your-jira-key
JIRA_PROJECT_KEYS=PROJ1,PROJ2

# Port configuration (for multi-project)
CODE_SERVER_PORT=8443
AGENT_API_PORT=3284
DEV_SERVER_PORT=3000
```

### SSH Key Authentication

For private repositories using SSH keys:

```bash
# Create .ssh directory in project
mkdir projects/my-project/.ssh

# Copy your SSH keys
cp ~/.ssh/id_rsa projects/my-project/.ssh/
cp ~/.ssh/id_rsa.pub projects/my-project/.ssh/

# Set proper permissions
chmod 600 projects/my-project/.ssh/id_rsa
chmod 644 projects/my-project/.ssh/id_rsa.pub

# Update docker-compose.yml to mount SSH keys
volumes:
  - ./.ssh:/home/coder/.ssh:ro
```

## 🚨 Troubleshooting

### Container Won't Start

```bash
# Check container logs
docker-compose logs claude-dev

# Check if ports are in use
netstat -tlnp | grep :8443
```

### Git Authentication Issues

```bash
# For HTTPS with token
docker-compose exec claude-dev git config --global credential.helper store

# For SSH keys
docker-compose exec claude-dev ssh -T git@github.com
```

### Permission Issues

```bash
# Fix file permissions
docker-compose exec claude-dev sudo chown -R coder:coder /workspace
```

## 🔄 Port Management

### Single Project Setup
- Code Server: 8443
- Agent API: 3284  
- Dev Server: 3000

### Multi-Project Setup
Increment ports for each project:
- Project 1: 8443, 3284, 3000
- Project 2: 8444, 3285, 3001
- Project 3: 8445, 3286, 3002

## 📝 Notes

- Each project runs independently with its own container
- Data persists in Docker volumes
- Use port-based access (localhost:PORT)
- No central management interface (use scripts)
- Suitable for local development and testing
- Simple setup compared to Kubernetes production environment

---

**For production deployments with centralized management, see the `production/` directory.**