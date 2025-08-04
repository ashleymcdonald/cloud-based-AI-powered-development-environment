FROM lscr.io/linuxserver/code-server:latest

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=20

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    python3 \
    python3-pip \
    wget \
    unzip \
    htop \
    tmux \
    zsh \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 (required for Claude Code)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code

# Install AgentAPI for HTTP control
RUN wget -O /usr/local/bin/agentapi https://github.com/coder/agentapi/releases/latest/download/agentapi-linux-amd64 \
    && chmod +x /usr/local/bin/agentapi

# Create workspace directory
RUN mkdir -p /workspace

# Setup git configuration script
COPY scripts/setup-git.sh /usr/local/bin/setup-git.sh
RUN chmod +x /usr/local/bin/setup-git.sh

# Setup startup script
COPY scripts/startup.sh /usr/local/bin/startup.sh
RUN chmod +x /usr/local/bin/startup.sh

WORKDIR /workspace
EXPOSE 8443 3284

# Use custom startup script
CMD ["/usr/local/bin/startup.sh"]