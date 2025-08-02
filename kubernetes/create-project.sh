#!/bin/bash

set -e

# Claude Code Project Instance Generator
# Creates a new project-specific deployment with proper Git authentication

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OVERLAYS_DIR="$SCRIPT_DIR/overlays"

# Default values
PROJECT_NAME=""
GIT_REPO=""
GIT_PROVIDER=""
AUTH_METHOD=""
NAMESPACE=""
ANTHROPIC_API_KEY=""
CODE_SERVER_PASSWORD=""
SUDO_PASSWORD=""
JIRA_BASE_URL=""
JIRA_EMAIL=""
JIRA_API_KEY=""
GIT_TOKEN=""
SSH_PRIVATE_KEY=""
SSH_PUBLIC_KEY=""
NODE_PORT_BASE=""

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Create a new Claude Code development environment for a specific project.

OPTIONS:
    -n, --name PROJECT_NAME         Project name (required)
    -r, --repo GIT_REPO            Git repository URL (required)
    -p, --provider PROVIDER         Git provider: github, gitlab, bitbucket (required)
    -a, --auth AUTH_METHOD          Authentication method: token, ssh-key, none (required)
    -k, --anthropic-key KEY         Anthropic API key (required)
    --code-password PASSWORD        Code server password (required)
    --sudo-password PASSWORD        Sudo password (required)
    --jira-url URL                  JIRA base URL (optional)
    --jira-email EMAIL              JIRA email (optional)
    --jira-key KEY                  JIRA API key (optional)
    --git-token TOKEN               Git access token (required for token auth)
    --ssh-private-key FILE          SSH private key file (required for ssh-key auth)
    --ssh-public-key FILE           SSH public key file (required for ssh-key auth)
    --nodeport-base PORT            Base NodePort (30000-32767, optional)
    --deploy                        Deploy immediately after creation
    -h, --help                      Show this help message

EXAMPLES:
    # GitHub with token authentication
    $0 -n myproject -r https://github.com/myorg/myproject.git -p github -a token \\
       -k sk-ant-xxx --code-password mypass --sudo-password mypass \\
       --git-token ghp_xxx --deploy

    # GitLab with SSH key authentication  
    $0 -n myproject -r git@gitlab.com:myorg/myproject.git -p gitlab -a ssh-key \\
       -k sk-ant-xxx --code-password mypass --sudo-password mypass \\
       --ssh-private-key ~/.ssh/id_rsa --ssh-public-key ~/.ssh/id_rsa.pub --deploy

    # Public repository (no authentication)
    $0 -n openai-python -r https://github.com/openai/openai-python.git -p github -a none \\
       -k sk-ant-xxx --code-password mypass --sudo-password mypass --deploy

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--name)
            PROJECT_NAME="$2"
            shift 2
            ;;
        -r|--repo)
            GIT_REPO="$2"
            shift 2
            ;;
        -p|--provider)
            GIT_PROVIDER="$2"
            shift 2
            ;;
        -a|--auth)
            AUTH_METHOD="$2"
            shift 2
            ;;
        -k|--anthropic-key)
            ANTHROPIC_API_KEY="$2"
            shift 2
            ;;
        --code-password)
            CODE_SERVER_PASSWORD="$2"
            shift 2
            ;;
        --sudo-password)
            SUDO_PASSWORD="$2"
            shift 2
            ;;
        --jira-url)
            JIRA_BASE_URL="$2"
            shift 2
            ;;
        --jira-email)
            JIRA_EMAIL="$2"
            shift 2
            ;;
        --jira-key)
            JIRA_API_KEY="$2"
            shift 2
            ;;
        --git-token)
            GIT_TOKEN="$2"
            shift 2
            ;;
        --ssh-private-key)
            SSH_PRIVATE_KEY="$2"
            shift 2
            ;;
        --ssh-public-key)
            SSH_PUBLIC_KEY="$2"
            shift 2
            ;;
        --nodeport-base)
            NODE_PORT_BASE="$2"
            shift 2
            ;;
        --deploy)
            DEPLOY=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$PROJECT_NAME" ]]; then
    echo "❌ Error: Project name is required"
    usage
    exit 1
fi

if [[ -z "$GIT_REPO" ]]; then
    echo "❌ Error: Git repository URL is required"
    usage
    exit 1
fi

if [[ -z "$GIT_PROVIDER" ]]; then
    echo "❌ Error: Git provider is required"
    usage
    exit 1
fi

if [[ -z "$AUTH_METHOD" ]]; then
    echo "❌ Error: Authentication method is required"
    usage
    exit 1
fi

if [[ -z "$ANTHROPIC_API_KEY" ]]; then
    echo "❌ Error: Anthropic API key is required"
    usage
    exit 1
fi

if [[ -z "$CODE_SERVER_PASSWORD" ]]; then
    echo "❌ Error: Code server password is required"
    usage
    exit 1
fi

if [[ -z "$SUDO_PASSWORD" ]]; then
    echo "❌ Error: Sudo password is required"
    usage
    exit 1
fi

# Validate git provider
if [[ ! "$GIT_PROVIDER" =~ ^(github|gitlab|bitbucket)$ ]]; then
    echo "❌ Error: Git provider must be one of: github, gitlab, bitbucket"
    exit 1
fi

# Validate auth method
if [[ ! "$AUTH_METHOD" =~ ^(token|ssh-key|none)$ ]]; then
    echo "❌ Error: Auth method must be one of: token, ssh-key, none"
    exit 1
fi

# Validate auth-specific requirements
if [[ "$AUTH_METHOD" == "token" && -z "$GIT_TOKEN" ]]; then
    echo "❌ Error: Git token is required for token authentication"
    exit 1
fi

if [[ "$AUTH_METHOD" == "ssh-key" ]]; then
    if [[ -z "$SSH_PRIVATE_KEY" || -z "$SSH_PUBLIC_KEY" ]]; then
        echo "❌ Error: SSH private and public key files are required for SSH key authentication"
        exit 1
    fi
    if [[ ! -f "$SSH_PRIVATE_KEY" ]]; then
        echo "❌ Error: SSH private key file not found: $SSH_PRIVATE_KEY"
        exit 1
    fi
    if [[ ! -f "$SSH_PUBLIC_KEY" ]]; then
        echo "❌ Error: SSH public key file not found: $SSH_PUBLIC_KEY"
        exit 1
    fi
fi

# Set defaults
NAMESPACE="${NAMESPACE:-claude-dev-$PROJECT_NAME}"
if [[ -n "$NODE_PORT_BASE" ]]; then
    if [[ "$NODE_PORT_BASE" -lt 30000 || "$NODE_PORT_BASE" -gt 32767 ]]; then
        echo "❌ Error: NodePort base must be between 30000 and 32767"
        exit 1
    fi
else
    # Generate a random NodePort base
    NODE_PORT_BASE=$((30000 + RANDOM % 2768))
fi

# Create project directory
PROJECT_DIR="$OVERLAYS_DIR/$PROJECT_NAME"
if [[ -d "$PROJECT_DIR" ]]; then
    echo "⚠️  Project directory already exists: $PROJECT_DIR"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
    rm -rf "$PROJECT_DIR"
fi

mkdir -p "$PROJECT_DIR"

echo "🚀 Creating Claude Code project: $PROJECT_NAME"
echo "📁 Project directory: $PROJECT_DIR"
echo "🔧 Git provider: $GIT_PROVIDER"
echo "🔐 Auth method: $AUTH_METHOD"
echo "🌐 Namespace: $NAMESPACE"
echo "🚪 NodePort base: $NODE_PORT_BASE"

# Create kustomization.yaml
cat > "$PROJECT_DIR/kustomization.yaml" << EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

# Reference to base configuration
resources:
  - ../../base

# Override namespace for this project
namespace: $NAMESPACE

# Override labels to include project-specific info
commonLabels:
  app: claude-dev-env
  project: $PROJECT_NAME
  git-provider: $GIT_PROVIDER
  auth-method: $AUTH_METHOD
  managed-by: kustomize

# Generate ConfigMap with project-specific settings
configMapGenerator:
  - name: claude-dev-config
    behavior: replace
    literals:
      - git-repo=$GIT_REPO$([ -n "$JIRA_BASE_URL" ] && echo "
      - jira-base-url=$JIRA_BASE_URL")$([ -n "$JIRA_EMAIL" ] && echo "
      - jira-email=$JIRA_EMAIL")

# Generate Secret with authentication credentials
secretGenerator:
  - name: claude-dev-secrets
    behavior: replace
    literals:
      - anthropic-api-key=$ANTHROPIC_API_KEY
      - code-server-password=$CODE_SERVER_PASSWORD
      - sudo-password=$SUDO_PASSWORD$([ -n "$GIT_TOKEN" ] && echo "
      - git-token=$GIT_TOKEN")$([ -n "$JIRA_API_KEY" ] && echo "
      - jira-api-key=$JIRA_API_KEY")$([ "$AUTH_METHOD" == "ssh-key" ] && echo "
  - name: claude-dev-ssh-key
    files:
      - ssh-privatekey=ssh-private-key
      - ssh-publickey=ssh-public-key")

# Patches to customize deployment for this project
patchesStrategicMerge:
  - project-patches.yaml

# Name prefix for all resources
namePrefix: ${PROJECT_NAME}-

# Override image tag if needed
images:
  - name: claude-dev-env
    newTag: latest
EOF

# Create project-patches.yaml
cat > "$PROJECT_DIR/project-patches.yaml" << EOF
# Deployment patches for $PROJECT_NAME ($GIT_PROVIDER with $AUTH_METHOD authentication)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-dev-env
spec:
  template:
    spec:
      containers:
      - name: claude-dev-env
        env:
        # Override default git configuration
        - name: GIT_PROVIDER
          value: "$GIT_PROVIDER"
        - name: GIT_AUTH_METHOD
          value: "$AUTH_METHOD"
        # Add project-specific environment variables
        - name: PROJECT_NAME
          value: "$PROJECT_NAME"
        - name: WORKSPACE_PATH
          value: "/workspace/$PROJECT_NAME"$([ "$AUTH_METHOD" == "ssh-key" ] && echo "
        volumeMounts:
        - name: workspace
          mountPath: /workspace
        - name: config
          mountPath: /config
        # Mount SSH keys
        - name: ssh-keys
          mountPath: /home/abc/.ssh
          readOnly: true
      volumes:
      - name: workspace
        persistentVolumeClaim:
          claimName: claude-dev-workspace
      - name: config
        persistentVolumeClaim:
          claimName: claude-dev-config
      # Add SSH key volume
      - name: ssh-keys
        secret:
          secretName: claude-dev-ssh-key
          defaultMode: 0600
          items:
          - key: ssh-privatekey
            path: id_rsa
          - key: ssh-publickey
            path: id_rsa.pub")

---
# Service patches for project-specific ports
apiVersion: v1
kind: Service
metadata:
  name: claude-dev-env-nodeport
spec:
  ports:
  - port: 8443
    targetPort: 8443
    nodePort: $((NODE_PORT_BASE + 443))
    protocol: TCP
    name: code-server
  - port: 3284
    targetPort: 3284
    nodePort: $((NODE_PORT_BASE + 284))
    protocol: TCP
    name: agentapi
  - port: 3000
    targetPort: 3000
    nodePort: $((NODE_PORT_BASE + 0))
    protocol: TCP
    name: dev-server
EOF

# Copy SSH keys if using SSH authentication
if [[ "$AUTH_METHOD" == "ssh-key" ]]; then
    echo "🔑 Copying SSH keys..."
    cp "$SSH_PRIVATE_KEY" "$PROJECT_DIR/ssh-private-key"
    cp "$SSH_PUBLIC_KEY" "$PROJECT_DIR/ssh-public-key"
    chmod 600 "$PROJECT_DIR/ssh-private-key"
    chmod 644 "$PROJECT_DIR/ssh-public-key"
fi

echo "✅ Project configuration created successfully!"
echo ""
echo "📋 Project Details:"
echo "   Name: $PROJECT_NAME"
echo "   Namespace: $NAMESPACE"
echo "   Git Repository: $GIT_REPO"
echo "   Authentication: $AUTH_METHOD"
echo "   NodePorts: $((NODE_PORT_BASE + 443)) (VS Code), $((NODE_PORT_BASE + 284)) (AgentAPI), $((NODE_PORT_BASE + 0)) (Dev Server)"
echo ""
echo "🚀 To deploy this project:"
echo "   cd $PROJECT_DIR"
echo "   kubectl apply -k ."
echo ""
echo "🌐 After deployment, access via:"
echo "   kubectl port-forward svc/${PROJECT_NAME}-claude-dev-env-service 8443:8443 -n $NAMESPACE"
echo "   Or using NodePort: http://your-node-ip:$((NODE_PORT_BASE + 443))"
echo ""
echo "🔗 To add this project to webhook routing (after deployment):"
echo "   cd $(dirname "$PROJECT_DIR")"
echo "   ./update-webhook-routing.sh --name $PROJECT_NAME --namespace $NAMESPACE --jira-projects \"YOUR-JIRA-PROJECTS\""

# Deploy if requested
if [[ "$DEPLOY" == "true" ]]; then
    echo ""
    echo "🚀 Deploying project..."
    cd "$PROJECT_DIR"
    kubectl apply -k .
    
    echo ""
    echo "⏳ Waiting for deployment to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/${PROJECT_NAME}-claude-dev-env -n "$NAMESPACE"
    
    echo ""
    echo "✅ Deployment complete!"
    echo "📊 Checking status..."
    kubectl get pods -n "$NAMESPACE"
    kubectl get services -n "$NAMESPACE"
fi