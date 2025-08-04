#!/bin/bash

set -e

echo "🚀 Deploying Nginx Proxy..."

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
NGINX_DIR="$(dirname "$SCRIPT_DIR")"

echo "📦 Building nginx proxy image..."
cd "$NGINX_DIR"
docker build -t claude-nginx-proxy:latest .

echo "📋 Creating namespace..."
kubectl apply -f "$SCRIPT_DIR/namespace.yaml"

echo "🚀 Deploying nginx proxy..."
kubectl apply -k "$SCRIPT_DIR"

echo "⏳ Waiting for deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/nginx-proxy -n claude-proxy

echo "✅ Deployment complete!"
echo ""
echo "📊 Checking status..."
kubectl get pods -n claude-proxy
kubectl get services -n claude-proxy

echo ""
echo "🌐 Access the proxy:"
echo "   LoadBalancer: kubectl get svc nginx-proxy-service -n claude-proxy"
echo "   NodePort: http://your-node-ip:30080"
echo ""
echo "📝 To view logs:"
echo "   kubectl logs -f deployment/nginx-proxy -n claude-proxy"
echo ""
echo "🔧 Routes:"
echo "   Manager: http://your-domain/manager/"
echo "   Projects: http://your-domain/[project-name]/"
echo "   Health: http://your-domain/health"