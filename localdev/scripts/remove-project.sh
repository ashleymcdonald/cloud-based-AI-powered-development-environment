#!/bin/bash

# Remove a Claude Code project (with confirmation)
# Usage: ./remove-project.sh <project-name> [--force]

set -e

PROJECT_NAME="$1"
FORCE_FLAG="$2"

if [ -z "$PROJECT_NAME" ]; then
    echo "Usage: $0 <project-name> [--force]"
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

echo "🗑️  Removing project: $PROJECT_NAME"
echo "   Directory: $PROJECT_DIR"

# Load project info if available
if [ -f "$PROJECT_DIR/.env" ]; then
    source "$PROJECT_DIR/.env" 2>/dev/null || true
    echo "   Display name: ${PROJECT_NAME:-$PROJECT_NAME}"
    echo "   Repository: ${GIT_REPOSITORY:-'Not configured'}"
fi

echo ""

# Confirmation unless --force is used
if [ "$FORCE_FLAG" != "--force" ]; then
    echo "⚠️  WARNING: This will permanently delete the project and all its data!"
    echo "   - Container will be stopped and removed"
    echo "   - Docker volumes will be removed (workspace data will be lost)"
    echo "   - Project directory will be deleted"
    echo ""
    read -p "Are you sure you want to remove project '$PROJECT_NAME'? (y/N): " -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Operation cancelled."
        exit 0
    fi
fi

cd "$PROJECT_DIR"

# Stop and remove containers
echo "🛑 Stopping containers..."
if docker-compose ps | grep -q "Up"; then
    docker-compose down
fi

echo "🗑️  Removing containers and volumes..."
docker-compose down --volumes --remove-orphans

# Remove any leftover containers
CONTAINER_NAME=$(basename "$PROJECT_DIR")
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$\|claude-${CONTAINER_NAME}"; then
    echo "   Removing leftover containers..."
    docker rm -f "${CONTAINER_NAME}" "claude-${CONTAINER_NAME}" 2>/dev/null || true
fi

# Remove any leftover volumes
VOLUME_PREFIX=$(basename "$PROJECT_DIR")
VOLUMES=$(docker volume ls --format '{{.Name}}' | grep "^${VOLUME_PREFIX}_\|^claude-${VOLUME_PREFIX}_" || true)
if [ -n "$VOLUMES" ]; then
    echo "   Removing leftover volumes..."
    echo "$VOLUMES" | xargs docker volume rm 2>/dev/null || true
fi

echo "📁 Removing project directory..."
cd ..
rm -rf "$PROJECT_DIR"

echo ""
echo "✅ Project '$PROJECT_NAME' removed successfully!"
echo ""
echo "📊 Remaining projects:"
if ls -1 projects/ 2>/dev/null | grep -q .; then
    ls -1 projects/ | sed 's/^/   - /'
else
    echo "   (none)"
fi