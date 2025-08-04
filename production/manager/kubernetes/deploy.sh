#!/bin/bash

set -e

echo "🚀 Deploying Claude Code Manager..."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if docker is available for building
if ! command -v docker &> /dev/null; then
    echo "❌ docker is not installed or not in PATH"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANAGER_DIR="$(dirname "$SCRIPT_DIR")"

echo "📦 Building manager application..."
cd "$MANAGER_DIR"

# Build TypeScript
echo "🔨 Compiling TypeScript..."
npm run build

# Build Docker image
echo "🐳 Building Docker image..."
docker build -t claude-manager:latest .

echo "📋 Creating namespace..."
kubectl apply -f "$SCRIPT_DIR/namespace.yaml"

echo "🔑 Creating RBAC resources..."
kubectl apply -f "$SCRIPT_DIR/rbac.yaml"

echo "⚙️  Applying configuration..."
kubectl apply -f "$SCRIPT_DIR/configmap.yaml"

# Check if secrets exist, if not create with dummy values for development
if ! kubectl get secret claude-manager-secrets -n claude-manager &> /dev/null; then
    echo "🔐 Creating development secrets..."
    kubectl create secret generic claude-manager-secrets \
        --from-literal=jira-api-key="dummy-jira-key" \
        --from-literal=default-anthropic-api-key="sk-ant-dummy-key" \
        --from-literal=jwt-secret="dummy-jwt-secret-for-development-only" \
        -n claude-manager
    
    echo "⚠️  IMPORTANT: Default development secrets created."
    echo "   Update with real values using:"
    echo "   kubectl create secret generic claude-manager-secrets \\"
    echo "     --from-literal=jira-api-key=\"your-jira-api-key\" \\"
    echo "     --from-literal=default-anthropic-api-key=\"your-anthropic-key\" \\"
    echo "     --from-literal=jwt-secret=\"your-jwt-secret\" \\"
    echo "     -n claude-manager --dry-run=client -o yaml | kubectl apply -f -"
else
    echo "🔐 Using existing secrets..."
fi

echo "💾 Creating persistent volume claim..."
kubectl apply -f "$SCRIPT_DIR/pvc.yaml"

echo "🚀 Deploying application..."
kubectl apply -f "$SCRIPT_DIR/deployment.yaml"

echo "🌐 Creating services..."
kubectl apply -f "$SCRIPT_DIR/service.yaml"

echo "⏳ Waiting for deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/claude-manager -n claude-manager

echo "✅ Deployment complete!"
echo ""
echo "📊 Checking status..."
kubectl get pods -n claude-manager
kubectl get services -n claude-manager

echo ""
echo "🌐 Access the manager:"
echo "   Port forward: kubectl port-forward svc/claude-manager-service 3000:3000 -n claude-manager"
echo "   Then visit: http://localhost:3000"
echo ""
echo "   External LoadBalancer: kubectl get svc claude-manager-external -n claude-manager"
echo "   NodePort: kubectl get svc claude-manager-nodeport -n claude-manager"
echo ""
echo "📝 To view logs:"
echo "   kubectl logs -f deployment/claude-manager -n claude-manager"
echo ""
echo "🔧 To update configuration:"
echo "   kubectl edit configmap claude-manager-config -n claude-manager"
echo "   kubectl rollout restart deployment/claude-manager -n claude-manager"