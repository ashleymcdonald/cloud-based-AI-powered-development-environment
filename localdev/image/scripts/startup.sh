#!/bin/bash

echo "🚀 Starting Claude Code Development Environment..."

# Start code-server in background
echo "📝 Starting code-server..."
/init &

# Wait for code-server to be ready
sleep 10

# Setup git if repository is specified
if [ ! -z "$GIT_REPO" ]; then
    echo "📦 Cloning repository..."
    /usr/local/bin/setup-git.sh
fi

# Setup Claude Code with JIRA MCP
echo "🤖 Configuring Claude Code with JIRA MCP..."
cd /workspace

# Add JIRA MCP server
if [ ! -z "$JIRA_API_KEY" ]; then
    claude mcp add jira-server \
        -e JIRA_API_KEY="$JIRA_API_KEY" \
        -e JIRA_BASE_URL="$JIRA_BASE_URL" \
        -e JIRA_EMAIL="$JIRA_EMAIL" \
        -- npx -y @composio/mcp@latest setup "jira"
fi

# Start AgentAPI server for HTTP control
echo "🌐 Starting AgentAPI server..."
nohup agentapi server -- claude --allowedTools "Bash(git*) Edit Replace Write" > /var/log/agentapi.log 2>&1 &

echo "✅ Environment ready!"
echo "🌐 code-server: http://localhost:8443"
echo "🔌 AgentAPI: http://localhost:3284"
echo "📚 API docs: http://localhost:3284/docs"

# Keep container running
tail -f /var/log/agentapi.log