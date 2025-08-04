#!/bin/bash

set -e

echo "🚀 Starting Claude Code Production Environment..."

# Create log directory
mkdir -p /var/log
touch /var/log/startup.log /var/log/agentapi.log /var/log/code-server.log

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a /var/log/startup.log
}

log "🔧 Initializing production environment..."

# Ensure proper ownership of directories
chown -R coder:coder /workspace /config /home/coder
chmod 755 /workspace /config

# Setup git configuration and clone repository
if [ ! -z "$GIT_REPOSITORY" ]; then
    log "📦 Setting up Git repository..."
    /usr/local/bin/setup-git.sh
fi

# Start code-server in background
log "📝 Starting code-server with production configuration..."

# Export required environment variables for code-server
export PASSWORD="${CODE_SERVER_PASSWORD:-password}"
export SUDO_PASSWORD="${SUDO_PASSWORD:-password}"

# Start code-server as coder user
sudo -u coder -E bash -c '
    cd /workspace
    code-server \
        --bind-addr 0.0.0.0:8443 \
        --auth password \
        --password "$PASSWORD" \
        --disable-telemetry \
        --disable-update-check \
        --locale en \
        --log debug \
        /workspace > /var/log/code-server.log 2>&1 &
'

# Wait for code-server to be ready
log "⏳ Waiting for code-server to initialize..."
for i in {1..30}; do
    if curl -s http://localhost:8443/healthz > /dev/null 2>&1; then
        log "✅ Code-server is ready"
        break
    fi
    sleep 2
done

# Setup Claude Code with enhanced configuration
log "🤖 Configuring Claude Code with production settings..."
cd /workspace

# Ensure ANTHROPIC_API_KEY is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
    log "⚠️  WARNING: ANTHROPIC_API_KEY not set. Claude Code will not function properly."
else
    log "✅ Anthropic API key configured"
fi

# Configure Claude Code as coder user
sudo -u coder bash -c '
    export ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"
    cd /workspace
    
    # Initialize Claude Code configuration
    claude --version > /dev/null 2>&1 || {
        echo "⚠️ Claude Code not responding, will retry later"
    }
'

# Setup JIRA MCP if configured
if [ ! -z "$JIRA_API_KEY" ] && [ ! -z "$JIRA_BASE_URL" ]; then
    log "🎫 Configuring JIRA MCP integration..."
    sudo -u coder bash -c '
        cd /workspace
        export JIRA_API_KEY="$JIRA_API_KEY"
        export JIRA_BASE_URL="$JIRA_BASE_URL"  
        export JIRA_EMAIL="$JIRA_EMAIL"
        
        # Add JIRA MCP server (if available)
        claude mcp add jira-server \
            -e JIRA_API_KEY="$JIRA_API_KEY" \
            -e JIRA_BASE_URL="$JIRA_BASE_URL" \
            -e JIRA_EMAIL="$JIRA_EMAIL" \
            -- npx -y @composio/mcp@latest setup "jira" 2>/dev/null || echo "JIRA MCP setup skipped"
    '
else
    log "ℹ️  JIRA MCP not configured (missing credentials)"
fi

# Start AgentAPI server for HTTP control
log "🌐 Starting AgentAPI server..."
sudo -u coder bash -c '
    cd /workspace
    export ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"
    nohup agentapi server \
        --host 0.0.0.0 \
        --port 3284 \
        --allowed-tools "Bash(git*),Edit,Replace,Write,Read,Grep,MultiEdit" \
        -- claude > /var/log/agentapi.log 2>&1 &
'

# Wait for AgentAPI to be ready
log "⏳ Waiting for AgentAPI to initialize..."
for i in {1..15}; do
    if curl -s http://localhost:3284/health > /dev/null 2>&1; then
        log "✅ AgentAPI is ready"
        break
    fi
    sleep 2
done

# Setup development server (if NODE_ENV allows)
if [ "$NODE_ENV" = "development" ]; then
    log "🚀 Setting up development server on port 3000..."
    sudo -u coder bash -c '
        cd /workspace
        # Start a simple HTTP server for development if package.json exists
        if [ -f "package.json" ]; then
            nohup npm run dev > /var/log/dev-server.log 2>&1 &
        fi
    ' || log "⚠️  No development server configured"
fi

log "✅ Production environment ready!"
log "🌐 Code-server: http://localhost:8443"
log "🔌 AgentAPI: http://localhost:3284"
log "📚 API docs: http://localhost:3284/docs"
log "👤 User: coder"
log "📂 Workspace: /workspace"

# Health monitoring function
monitor_services() {
    while true; do
        sleep 30
        
        # Check code-server
        if ! curl -s http://localhost:8443/healthz > /dev/null 2>&1; then
            log "⚠️  Code-server health check failed"
        fi
        
        # Check AgentAPI
        if ! curl -s http://localhost:3284/health > /dev/null 2>&1; then
            log "⚠️  AgentAPI health check failed"
        fi
    done
}

# Start health monitoring in background
monitor_services &

# Keep container running and tail logs
log "📊 Monitoring services and tailing logs..."
tail -f /var/log/agentapi.log /var/log/code-server.log /var/log/startup.log