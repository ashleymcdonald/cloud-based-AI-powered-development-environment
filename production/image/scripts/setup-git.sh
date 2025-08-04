#!/bin/bash

# Production Git setup script with enhanced authentication support

set -e

echo "🔧 Setting up Git configuration..."

# Set git configuration defaults
git config --global user.name "${GIT_USER_NAME:-Claude Code Bot}"
git config --global user.email "${GIT_USER_EMAIL:-claude@cluster.local}"
git config --global init.defaultBranch main
git config --global pull.rebase false
git config --global core.autocrlf input

# Configure Git based on authentication type
if [ "$GIT_AUTH_TYPE" = "ssh-key" ]; then
    echo "🔑 Configuring SSH key authentication..."
    
    # Create SSH directory if it doesn't exist
    mkdir -p /home/coder/.ssh
    chmod 700 /home/coder/.ssh
    
    # Setup SSH keys if provided as environment variables
    if [ ! -z "$SSH_PRIVATE_KEY" ]; then
        echo "$SSH_PRIVATE_KEY" | base64 -d > /home/coder/.ssh/id_rsa
        chmod 600 /home/coder/.ssh/id_rsa
    fi
    
    if [ ! -z "$SSH_PUBLIC_KEY" ]; then
        echo "$SSH_PUBLIC_KEY" | base64 -d > /home/coder/.ssh/id_rsa.pub  
        chmod 644 /home/coder/.ssh/id_rsa.pub
    fi
    
    # Configure SSH to not do strict host key checking for Git operations
    cat > /home/coder/.ssh/config << EOF
Host github.com
    HostName github.com
    User git
    IdentityFile /home/coder/.ssh/id_rsa
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null

Host gitlab.com
    HostName gitlab.com
    User git
    IdentityFile /home/coder/.ssh/id_rsa
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null

Host bitbucket.org
    HostName bitbucket.org
    User git
    IdentityFile /home/coder/.ssh/id_rsa
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
EOF
    chmod 600 /home/coder/.ssh/config
    
    # Ensure coder owns SSH files
    chown -R coder:coder /home/coder/.ssh
    
elif [ "$GIT_AUTH_TYPE" = "token" ] && [ ! -z "$GIT_TOKEN" ]; then
    echo "🎫 Configuring token authentication..."
    
    # Configure Git credential helper for token-based auth
    git config --global credential.helper store
    
    # Determine the provider and setup credentials accordingly
    if [[ "$GIT_REPOSITORY" == *"github.com"* ]]; then
        echo "https://${GIT_TOKEN}@github.com" > /home/coder/.git-credentials
    elif [[ "$GIT_REPOSITORY" == *"gitlab.com"* ]]; then
        echo "https://oauth2:${GIT_TOKEN}@gitlab.com" > /home/coder/.git-credentials
    elif [[ "$GIT_REPOSITORY" == *"bitbucket.org"* ]]; then
        echo "https://x-token-auth:${GIT_TOKEN}@bitbucket.org" > /home/coder/.git-credentials
    else
        # Generic token setup
        git_host=$(echo "$GIT_REPOSITORY" | sed -n 's/https:\/\/\([^\/]*\).*/\1/p')
        if [ ! -z "$git_host" ]; then
            echo "https://${GIT_TOKEN}@${git_host}" > /home/coder/.git-credentials
        fi
    fi
    
    chmod 600 /home/coder/.git-credentials
    chown coder:coder /home/coder/.git-credentials
fi

# Clone repository if specified and doesn't exist
if [ ! -z "$GIT_REPOSITORY" ]; then
    cd /workspace
    
    if [ -d ".git" ]; then
        echo "📂 Repository already exists, pulling latest changes..."
        sudo -u coder git pull origin main || sudo -u coder git pull origin master || echo "Could not pull from remote"
    else
        echo "📥 Cloning repository: $GIT_REPOSITORY"
        
        # Clone as the coder user
        sudo -u coder git clone "$GIT_REPOSITORY" . || {
            echo "❌ Failed to clone repository"
            exit 1
        }
        
        echo "✅ Repository cloned successfully"
    fi
    
    # Ensure workspace is owned by coder
    chown -R coder:coder /workspace
fi

echo "✅ Git setup complete!"