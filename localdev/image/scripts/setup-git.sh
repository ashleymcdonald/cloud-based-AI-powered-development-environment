#!/bin/bash

if [ -z "$GIT_REPO" ]; then
    echo "No repository specified"
    exit 0
fi

cd /workspace

# Check if repo already exists
if [ -d ".git" ]; then
    echo "Repository already exists, pulling latest..."
    git pull
else
    echo "Cloning repository: $GIT_REPO"
    
    if [ ! -z "$GIT_TOKEN" ]; then
        # Clone with token authentication
        repo_url=$(echo $GIT_REPO | sed "s|https://|https://$GIT_TOKEN@|")
        git clone "$repo_url" .
    else
        git clone "$GIT_REPO" .
    fi
fi

# Set git configuration
git config --global user.name "Claude Code Bot"
git config --global user.email "claude@your-org.com"
git config --global init.defaultBranch main

echo "Git setup complete!"