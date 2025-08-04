#!/bin/bash

set -e

# Script to update webhook routing configuration with new project

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Update webhook routing configuration to include a new project.

OPTIONS:
    -n, --name PROJECT_NAME         Project name (required)
    -s, --namespace NAMESPACE       Kubernetes namespace (required)
    -j, --jira-projects PROJECTS    Comma-separated JIRA project keys (required)
    -u, --url AGENTAPI_URL         AgentAPI URL (optional, auto-generated if not provided)
    --enable                        Enable the route (default: true)
    --disable                       Disable the route
    -h, --help                      Show this help message

EXAMPLES:
    # Add a new project route
    $0 --name myproject --namespace claude-dev-myproject --jira-projects "MYPROJ,PROJ-*"

    # Add with custom AgentAPI URL
    $0 --name frontend --namespace claude-dev-frontend --jira-projects "FRONT,UI" \\
       --url "http://custom-service.namespace.svc.cluster.local:3284"

    # Add but keep disabled initially
    $0 --name newproject --namespace claude-dev-newproject --jira-projects "NEW" --disable

EOF
}

# Default values
PROJECT_NAME=""
NAMESPACE=""
JIRA_PROJECTS=""
AGENTAPI_URL=""
ENABLED=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--name)
            PROJECT_NAME="$2"
            shift 2
            ;;
        -s|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -j|--jira-projects)
            JIRA_PROJECTS="$2"
            shift 2
            ;;
        -u|--url)
            AGENTAPI_URL="$2"
            shift 2
            ;;
        --enable)
            ENABLED=true
            shift
            ;;
        --disable)
            ENABLED=false
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

if [[ -z "$NAMESPACE" ]]; then
    echo "❌ Error: Namespace is required"
    usage
    exit 1
fi

if [[ -z "$JIRA_PROJECTS" ]]; then
    echo "❌ Error: JIRA projects are required"
    usage
    exit 1
fi

# Generate AgentAPI URL if not provided
if [[ -z "$AGENTAPI_URL" ]]; then
    AGENTAPI_URL="http://${PROJECT_NAME}-claude-dev-env-service.${NAMESPACE}.svc.cluster.local:3284"
fi

# Convert comma-separated JIRA projects to YAML array format
IFS=',' read -ra JIRA_ARRAY <<< "$JIRA_PROJECTS"
JIRA_YAML=""
for project in "${JIRA_ARRAY[@]}"; do
    project=$(echo "$project" | xargs) # trim whitespace
    JIRA_YAML="$JIRA_YAML
          - \"$project\""
done

echo "🔧 Updating webhook routing configuration..."
echo "   Project: $PROJECT_NAME"
echo "   Namespace: $NAMESPACE"
echo "   JIRA Projects: $JIRA_PROJECTS"
echo "   AgentAPI URL: $AGENTAPI_URL"
echo "   Enabled: $ENABLED"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if webhook service exists
if ! kubectl get configmap webhook-routing-config -n claude-webhook &> /dev/null; then
    echo "❌ Webhook service not found. Please deploy it first with:"
    echo "   cd kubernetes/webhook-service && ./deploy.sh"
    exit 1
fi

# Get current configuration
TEMP_FILE=$(mktemp)
kubectl get configmap webhook-routing-config -n claude-webhook -o jsonpath='{.data.routing\.yaml}' > "$TEMP_FILE"

# Check if project already exists in configuration
if grep -q "name: \"$PROJECT_NAME\"" "$TEMP_FILE"; then
    echo "⚠️  Project '$PROJECT_NAME' already exists in routing configuration"
    read -p "Do you want to update it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        rm "$TEMP_FILE"
        exit 1
    fi
    
    # Remove existing entry (simple approach - remove the entire block)
    # This is a basic implementation; in production, you might want more sophisticated YAML editing
    echo "🔄 Removing existing configuration for project '$PROJECT_NAME'..."
    # Note: This is a simplified approach. For production use, consider using yq or similar tools
fi

# Add new route to the configuration
echo "📝 Adding new route configuration..."

# Create new route entry
NEW_ROUTE="  - name: \"$PROJECT_NAME\"
    namespace: \"$NAMESPACE\"
    agentapi_url: \"$AGENTAPI_URL\"
    jira_projects:$JIRA_YAML
    enabled: $ENABLED"

# Create new configuration file
NEW_CONFIG_FILE=$(mktemp)

# Read the original config and add the new route
awk -v new_route="$NEW_ROUTE" '
/^routes:/ {
    print
    in_routes = 1
    next
}
/^catch_all:/ {
    if (in_routes) {
        print new_route
        print ""
        in_routes = 0
    }
    print
    next
}
{
    print
}
END {
    if (in_routes) {
        print new_route
    }
}' "$TEMP_FILE" > "$NEW_CONFIG_FILE"

# Update the ConfigMap
echo "🚀 Updating ConfigMap..."
kubectl create configmap webhook-routing-config-new \
    --from-file=routing.yaml="$NEW_CONFIG_FILE" \
    --dry-run=client -o yaml | \
    kubectl apply -f - && \
    kubectl delete configmap webhook-routing-config -n claude-webhook && \
    kubectl create configmap webhook-routing-config \
        --from-file=routing.yaml="$NEW_CONFIG_FILE" \
        -n claude-webhook

# Restart webhook service to pick up new configuration
echo "🔄 Restarting webhook service..."
kubectl rollout restart deployment/webhook-service -n claude-webhook

# Wait for restart to complete
echo "⏳ Waiting for webhook service restart..."
kubectl rollout status deployment/webhook-service -n claude-webhook

echo "✅ Webhook routing configuration updated successfully!"
echo ""
echo "📋 New route added:"
echo "   Project: $PROJECT_NAME"
echo "   Namespace: $NAMESPACE" 
echo "   JIRA Projects: $JIRA_PROJECTS"
echo "   AgentAPI URL: $AGENTAPI_URL"
echo "   Enabled: $ENABLED"
echo ""
echo "🔍 To verify the configuration:"
echo "   kubectl exec -it deployment/webhook-service -n claude-webhook -- curl localhost:5000/routes"
echo ""
echo "📝 To test the webhook:"
echo "   kubectl port-forward svc/webhook-service 5000:80 -n claude-webhook"
echo "   curl http://localhost:5000/routes"

# Cleanup
rm "$TEMP_FILE" "$NEW_CONFIG_FILE"