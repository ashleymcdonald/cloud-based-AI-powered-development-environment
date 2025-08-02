#!/bin/bash

set -e

echo "🚀 Deploying Claude Code Webhook Service..."

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
WEBHOOK_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")/webhook-service"

echo "📦 Building webhook service image..."
cd "$WEBHOOK_DIR"
docker build -t claude-webhook-service:latest .

echo "📋 Creating namespace..."
kubectl apply -f "$SCRIPT_DIR/namespace.yaml"

echo "🔧 Applying webhook service configuration..."
kubectl apply -k "$SCRIPT_DIR"

echo "⏳ Waiting for deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/webhook-service -n claude-webhook

echo "✅ Webhook service deployment complete!"
echo ""
echo "📊 Checking status..."
kubectl get pods -n claude-webhook
kubectl get services -n claude-webhook

echo ""
echo "🌐 Access webhook service:"
echo "   External (LoadBalancer): kubectl get svc webhook-service -n claude-webhook"
echo "   NodePort: http://your-node-ip:30500"
echo "   Port forward: kubectl port-forward svc/webhook-service 5000:80 -n claude-webhook"
echo ""
echo "📚 Webhook endpoints:"
echo "   Health check: GET /health"
echo "   JIRA webhook: POST /jira-webhook"
echo "   Manual trigger: POST /trigger-claude"
echo "   List routes: GET /routes"
echo "   Claude status: GET /claude-status"
echo "   Reload config: POST /config/reload"
echo ""
echo "🔧 To update routing configuration:"
echo "   kubectl edit configmap webhook-routing-config -n claude-webhook"
echo "   kubectl rollout restart deployment/webhook-service -n claude-webhook"