#!/bin/bash

# Start a Claude Code project
# Usage: ./start-project.sh <project-name>

set -e

PROJECT_NAME="$1"

if [ -z "$PROJECT_NAME" ]; then
    echo "Usage: $0 <project-name>"
    echo ""
    echo "Available projects:"
    ./scripts/list-projects.sh | grep "📂" | sed 's/📂 /  - /'
    exit 1
fi

PROJECT_DIR="projects/$PROJECT_NAME"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "Error: Project '$PROJECT_NAME' not found in $PROJECT_DIR"
    echo ""
    echo "Available projects:"
    ls -1 projects/ 2>/dev/null | sed 's/^/  - /' || echo "  (none)"
    exit 1
fi

if [ ! -f "$PROJECT_DIR/docker-compose.yml" ]; then
    echo "Error: No docker-compose.yml found in $PROJECT_DIR"
    exit 1
fi

echo "🚀 Starting project: $PROJECT_NAME"

cd "$PROJECT_DIR"

# Check if .env file exists and load it for display
if [ -f ".env" ]; then
    source ".env" 2>/dev/null || true
    echo "   Display name: ${PROJECT_NAME:-$PROJECT_NAME}"
    echo "   Repository: ${GIT_REPOSITORY:-'Not configured'}"
fi

# Start the project
docker-compose up -d

# Wait a moment for the container to start
sleep 2

# Check if container started successfully
if docker-compose ps | grep -q "Up"; then
    echo ""
    echo "✅ Project started successfully!"
    echo ""
    
    # Show access URLs
    CODE_SERVER_PORT=${CODE_SERVER_PORT:-8443}
    AGENT_API_PORT=${AGENT_API_PORT:-3284}
    DEV_SERVER_PORT=${DEV_SERVER_PORT:-3000}
    
    echo "🔗 Access URLs:"
    echo "   🖥️  VS Code Server: http://localhost:$CODE_SERVER_PORT"
    echo "   🤖 Claude Agent API: http://localhost:$AGENT_API_PORT"
    echo "   🚀 Dev Server: http://localhost:$DEV_SERVER_PORT"
    echo ""
    echo "📋 Useful commands:"
    echo "   docker-compose logs -f claude-dev  # View logs"
    echo "   docker-compose exec claude-dev bash  # Shell access"
    echo "   ./stop.sh  # Stop the project"
    echo ""
    
    # Show status
    echo "📊 Container status:"
    docker-compose ps
else
    echo ""
    echo "❌ Project failed to start. Check logs:"
    echo "   docker-compose logs claude-dev"
    echo ""
    docker-compose ps
    exit 1
fi