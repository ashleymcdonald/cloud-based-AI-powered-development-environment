#!/bin/bash

# List all Claude Code projects and their status
# Usage: ./list-projects.sh

set -e

PROJECTS_DIR="projects"

if [ ! -d "$PROJECTS_DIR" ]; then
    echo "No projects directory found. Create projects with ./create-project.sh first."
    exit 1
fi

echo "🚀 Claude Code Local Projects"
echo "=============================="
echo ""

projects_found=0

for project_dir in "$PROJECTS_DIR"/*; do
    if [ -d "$project_dir" ] && [ -f "$project_dir/docker-compose.yml" ]; then
        projects_found=1
        project_name=$(basename "$project_dir")
        
        # Get project details from .env file
        project_display_name=""
        git_repository=""
        code_server_port=""
        agent_api_port=""
        dev_server_port=""
        
        if [ -f "$project_dir/.env" ]; then
            source "$project_dir/.env" 2>/dev/null || true
            project_display_name="$PROJECT_NAME"
            git_repository="$GIT_REPOSITORY"
            code_server_port="$CODE_SERVER_PORT"
            agent_api_port="$AGENT_API_PORT"
            dev_server_port="$DEV_SERVER_PORT"
        fi
        
        # Check if container is running
        container_name=$(cd "$project_dir" && docker-compose ps -q claude-dev 2>/dev/null | head -1)
        status="❌ Stopped"
        container_status=""
        
        if [ -n "$container_name" ]; then
            container_status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "not found")
            case "$container_status" in
                "running")
                    status="✅ Running"
                    ;;
                "exited")
                    status="🛑 Exited"
                    ;;
                "restarting")
                    status="🔄 Restarting"
                    ;;
                *)
                    status="❓ Unknown"
                    ;;
            esac
        fi
        
        echo "📂 $project_name"
        echo "   Name: ${project_display_name:-$project_name}"
        echo "   Status: $status"
        echo "   Repository: ${git_repository:-'Not configured'}"
        
        if [ "$container_status" = "running" ]; then
            echo "   🖥️  VS Code: http://localhost:${code_server_port:-8443}"
            echo "   🤖 Claude API: http://localhost:${agent_api_port:-3284}"
            echo "   🚀 Dev Server: http://localhost:${dev_server_port:-3000}"
        fi
        
        echo "   📁 Directory: $project_dir"
        echo ""
    fi
done

if [ $projects_found -eq 0 ]; then
    echo "No projects found in $PROJECTS_DIR/"
    echo ""
    echo "Create a new project with:"
    echo "  ./scripts/create-project.sh my-project https://github.com/org/repo.git"
    echo ""
else
    echo "Available commands:"
    echo "  ./scripts/start-project.sh <project-name>   - Start a project"
    echo "  ./scripts/stop-project.sh <project-name>    - Stop a project"
    echo "  ./scripts/remove-project.sh <project-name>  - Remove a project"
    echo ""
fi