FROM lscr.io/linuxserver/code-server:latest

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=20

# Install system dependencies for production environment
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
    jq \
    rsync \
    openssh-client \
    ca-certificates \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 (required for Claude Code)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code

# Install AgentAPI for HTTP control
RUN wget -O /usr/local/bin/agentapi https://github.com/coder/agentapi/releases/latest/download/agentapi-linux-amd64 \
    && chmod +x /usr/local/bin/agentapi

# Install additional production tools
RUN npm install -g \
    typescript \
    @types/node \
    pm2 \
    nodemon

# Install Docker CLI for container management (if needed)
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Install kubectl for Kubernetes operations
RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl \
    && rm kubectl

# Create necessary directories
RUN mkdir -p /workspace /config /var/log

# Setup git configuration script
COPY scripts/setup-git.sh /usr/local/bin/setup-git.sh
RUN chmod +x /usr/local/bin/setup-git.sh

# Setup startup script for production
COPY scripts/startup.sh /usr/local/bin/startup.sh
RUN chmod +x /usr/local/bin/startup.sh

# Setup health check script
COPY scripts/healthcheck.sh /usr/local/bin/healthcheck.sh
RUN chmod +x /usr/local/bin/healthcheck.sh

# Create coder user with proper permissions
RUN groupadd -r coder && useradd -r -g coder -d /home/coder -s /bin/bash coder \
    && mkdir -p /home/coder \
    && chown -R coder:coder /home/coder /workspace /config

# Set working directory
WORKDIR /workspace

# Expose ports
EXPOSE 8443 3284 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD ["/usr/local/bin/healthcheck.sh"]

# Use custom startup script
CMD ["/usr/local/bin/startup.sh"]