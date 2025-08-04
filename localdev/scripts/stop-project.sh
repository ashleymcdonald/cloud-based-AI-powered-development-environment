#!/bin/bash

# Stop a Claude Code project
# Usage: ./stop-project.sh <project-name>

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

echo "🛑 Stopping project: $PROJECT_NAME"

cd "$PROJECT_DIR"

# Check if container is running
if docker-compose ps | grep -q "Up"; then
    echo "   Stopping containers..."
    docker-compose down
    
    echo ""
    echo "✅ Project stopped successfully!"
else
    echo "   Project is already stopped."
fi

echo ""
echo "📊 Final status:"
docker-compose ps