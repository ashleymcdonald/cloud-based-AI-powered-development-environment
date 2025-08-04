#!/bin/bash

# Create a new Claude Code project
# Usage: ./create-project.sh <project-name> <git-repository> [anthropic-api-key]

set -e

PROJECT_NAME="$1"
GIT_REPOSITORY="$2"
ANTHROPIC_API_KEY="$3"

if [ -z "$PROJECT_NAME" ] || [ -z "$GIT_REPOSITORY" ]; then
    echo "Usage: $0 <project-name> <git-repository> [anthropic-api-key]"
    echo "Example: $0 my-project https://github.com/org/repo.git sk-ant-..."
    exit 1
fi

# Sanitize project name for directory/container names
PROJECT_SLUG=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-\|-$//g')

PROJECT_DIR="projects/$PROJECT_SLUG"

if [ -d "$PROJECT_DIR" ]; then
    echo "Error: Project directory '$PROJECT_DIR' already exists"
    exit 1
fi

echo "Creating new Claude Code project: $PROJECT_NAME"
echo "Project directory: $PROJECT_DIR"
echo "Git repository: $GIT_REPOSITORY"

# Create project directory
mkdir -p "$PROJECT_DIR"

# Copy docker-compose template
cp docker-compose/docker-compose.project.yml "$PROJECT_DIR/docker-compose.yml"

# Generate random passwords if not provided
CODE_SERVER_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
SUDO_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)

# Find available ports
CODE_SERVER_PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()")
AGENT_API_PORT=$((CODE_SERVER_PORT + 1))
DEV_SERVER_PORT=$((CODE_SERVER_PORT + 2))

# Create .env file
cat > "$PROJECT_DIR/.env" << EOF
# Project Configuration
PROJECT_NAME=$PROJECT_NAME
GIT_REPOSITORY=$GIT_REPOSITORY

# Authentication
GIT_AUTH_TYPE=token
GIT_TOKEN=

# Claude Code Configuration
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
CODE_SERVER_PASSWORD=$CODE_SERVER_PASSWORD
SUDO_PASSWORD=$SUDO_PASSWORD

# Port Configuration
CODE_SERVER_PORT=$CODE_SERVER_PORT
AGENT_API_PORT=$AGENT_API_PORT
DEV_SERVER_PORT=$DEV_SERVER_PORT

# JIRA Integration (optional)
JIRA_BASE_URL=
JIRA_EMAIL=
JIRA_API_KEY=
JIRA_PROJECT_KEYS=

# Development Settings
LOG_LEVEL=info
NODE_ENV=development
EOF

# Create SSH directory for potential SSH keys
mkdir -p "$PROJECT_DIR/.ssh"
chmod 700 "$PROJECT_DIR/.ssh"

# Create a simple start script
cat > "$PROJECT_DIR/start.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker-compose up -d
echo "Project started!"
echo "VS Code Server: http://localhost:${CODE_SERVER_PORT:-8443}"
echo "Claude Agent API: http://localhost:${AGENT_API_PORT:-3284}"
echo "Dev Server: http://localhost:${DEV_SERVER_PORT:-3000}"
EOF

chmod +x "$PROJECT_DIR/start.sh"

# Create a stop script
cat > "$PROJECT_DIR/stop.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker-compose down
echo "Project stopped!"
EOF

chmod +x "$PROJECT_DIR/stop.sh"

# Create a logs script
cat > "$PROJECT_DIR/logs.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker-compose logs -f claude-dev
EOF

chmod +x "$PROJECT_DIR/logs.sh"

echo ""
echo "✅ Project '$PROJECT_NAME' created successfully!"
echo ""
echo "📁 Project directory: $PROJECT_DIR"
echo "🔑 Code Server password: $CODE_SERVER_PASSWORD"
echo "🔐 Sudo password: $SUDO_PASSWORD"
echo ""
echo "Next steps:"
echo "1. Edit $PROJECT_DIR/.env to configure your settings (ANTHROPIC_API_KEY, GIT_TOKEN, etc.)"
echo "2. If using SSH keys, copy them to $PROJECT_DIR/.ssh/"
echo "3. Start the project:"
echo "   cd $PROJECT_DIR && ./start.sh"
echo ""
echo "Access URLs (after starting):"
echo "🖥️  VS Code Server: http://localhost:$CODE_SERVER_PORT"
echo "🤖 Claude Agent API: http://localhost:$AGENT_API_PORT"
echo "🚀 Dev Server: http://localhost:$DEV_SERVER_PORT"
echo ""
echo "Useful commands:"
echo "   ./start.sh   - Start the project"
echo "   ./stop.sh    - Stop the project"
echo "   ./logs.sh    - View project logs"