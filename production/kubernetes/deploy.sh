#!/bin/bash

set -e

echo "🚀 Deploying Claude Code Development Environment to Kubernetes..."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Create namespace
echo "📦 Creating namespace..."
kubectl apply -f namespace.yaml

# Create secrets (you need to edit this with your actual values)
echo "🔐 Creating secrets..."
echo "⚠️  IMPORTANT: Update the secret values before running this script!"
echo "You can create secrets manually with:"
echo "kubectl create secret generic claude-dev-secrets -n claude-dev \\"
echo "  --from-literal=anthropic-api-key=\"your-api-key\" \\"
echo "  --from-literal=code-server-password=\"your-password\" \\"
echo "  --from-literal=sudo-password=\"your-sudo-password\" \\"
echo "  --from-literal=git-token=\"your-git-token\" \\"
echo "  --from-literal=jira-api-key=\"your-jira-api-key\""
echo ""

read -p "Have you created the secrets? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please create the secrets first, then run this script again."
    exit 1
fi

# Apply all manifests
echo "📋 Applying ConfigMap..."
kubectl apply -f configmap.yaml -n claude-dev

echo "💾 Creating Persistent Volume Claims..."
kubectl apply -f pvc.yaml -n claude-dev

echo "🚀 Deploying application..."
kubectl apply -f deployment.yaml -n claude-dev

echo "🌐 Creating services..."
kubectl apply -f service.yaml -n claude-dev

echo "⏳ Waiting for deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/claude-dev-env -n claude-dev

echo "✅ Deployment complete!"
echo ""
echo "📊 Checking status..."
kubectl get pods -n claude-dev
kubectl get services -n claude-dev

echo ""
echo "🌐 Access your environment:"
echo "VS Code: kubectl port-forward svc/claude-dev-env-service 8443:8443 -n claude-dev"
echo "AgentAPI: kubectl port-forward svc/claude-dev-env-service 3284:3284 -n claude-dev"
echo "Dev Server: kubectl port-forward svc/claude-dev-env-service 3000:3000 -n claude-dev"
echo ""
echo "Or if using NodePort service:"
echo "VS Code: http://your-node-ip:30443"
echo "AgentAPI: http://your-node-ip:30284"
echo "Dev Server: http://your-node-ip:30000"