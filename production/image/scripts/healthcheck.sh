#!/bin/bash

# Production health check script
# Returns 0 (success) if services are healthy, 1 (failure) otherwise

set -e

# Function to check if a service is responding
check_service() {
    local service_name="$1"
    local url="$2"
    local timeout="$3"
    
    if curl -s -f --max-time "$timeout" "$url" > /dev/null 2>&1; then
        echo "✅ $service_name: healthy"
        return 0
    else
        echo "❌ $service_name: unhealthy"
        return 1
    fi
}

echo "🏥 Production environment health check..."

# Initialize health status
overall_health=0

# Check code-server (VS Code)
if ! check_service "Code-server" "http://localhost:8443/healthz" 5; then
    overall_health=1
fi

# Check AgentAPI (Claude Code API)
if ! check_service "AgentAPI" "http://localhost:3284/health" 5; then
    overall_health=1
fi

# Check if workspace is accessible
if [ -d "/workspace" ] && [ -r "/workspace" ]; then
    echo "✅ Workspace: accessible"
else
    echo "❌ Workspace: not accessible"
    overall_health=1
fi

# Check if config directory is accessible
if [ -d "/config" ] && [ -r "/config" ]; then
    echo "✅ Config: accessible"
else
    echo "❌ Config: not accessible"
    overall_health=1
fi

# Check if Claude Code is functional (if ANTHROPIC_API_KEY is set)
if [ ! -z "$ANTHROPIC_API_KEY" ]; then
    if sudo -u coder claude --version > /dev/null 2>&1; then
        echo "✅ Claude Code: functional"
    else
        echo "⚠️  Claude Code: may not be functional"
        # Don't fail health check for this as it might be starting up
    fi
else
    echo "⚠️  Claude Code: API key not configured"
fi

# Check disk space
workspace_usage=$(df /workspace | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$workspace_usage" -lt 90 ]; then
    echo "✅ Disk space: ${workspace_usage}% used"
else
    echo "⚠️  Disk space: ${workspace_usage}% used (high)"
    # Don't fail for disk space, just warn
fi

# Check memory usage
if command -v free > /dev/null 2>&1; then
    memory_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    if [ "$memory_usage" -lt 90 ]; then
        echo "✅ Memory: ${memory_usage}% used"
    else
        echo "⚠️  Memory: ${memory_usage}% used (high)"
    fi
fi

# Overall health status
if [ $overall_health -eq 0 ]; then
    echo "✅ Overall health: HEALTHY"
    exit 0
else
    echo "❌ Overall health: UNHEALTHY"
    exit 1
fi