#!/bin/bash

set -e

echo "🚀 Deploying Claude Monitoring Stack..."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "📋 Creating monitoring namespace and RBAC..."
kubectl apply -f "$SCRIPT_DIR/prometheus-deployment.yaml"

echo "⏳ Waiting for Prometheus deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/prometheus -n claude-monitoring

echo "✅ Deployment complete!"
echo ""
echo "📊 Checking status..."
kubectl get pods -n claude-monitoring
kubectl get services -n claude-monitoring

echo ""
echo "🌐 Access Prometheus:"
echo "   NodePort: http://your-node-ip:30090"
echo "   Port Forward: kubectl port-forward svc/prometheus-service 9090:9090 -n claude-monitoring"
echo ""
echo "📝 To view logs:"
echo "   kubectl logs -f deployment/prometheus -n claude-monitoring"
echo ""
echo "🎯 Prometheus targets:"
echo "   - Claude Manager: http://claude-manager-service.claude-manager.svc.cluster.local:3000/api/monitoring/metrics"
echo "   - Kubernetes API: https://kubernetes.default.svc:443/metrics"
echo "   - Node metrics: /api/v1/nodes/{node}/proxy/metrics"
echo ""
echo "📈 Monitoring Dashboard:"
echo "   Access via Claude Manager: http://your-domain/manager/ → Monitoring tab"
echo "   Direct Prometheus: http://your-node-ip:30090"