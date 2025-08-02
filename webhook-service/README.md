# Claude Code Webhook Service

A centralized webhook routing service that receives JIRA events and routes them to the appropriate Claude Code project instances based on configurable rules.

## 🎯 Purpose

Instead of running multiple webhook handlers, this service acts as a **smart router** that:

- Receives JIRA webhooks from a single endpoint
- Routes tickets to specific Claude Code instances based on JIRA project keys
- Provides a catch-all fallback for unmatched projects
- Supports pattern matching for flexible routing rules
- Offers centralized monitoring and management

## 🏗️ Architecture

```
JIRA → Webhook Service → Route Based on Project → Specific Claude Code Instance
                     ↓
                  Catch-All → Default Claude Code Instance
```

## 🚀 Features

### Smart Routing
- **Project-based routing**: Route tickets based on JIRA project keys
- **Pattern matching**: Support wildcards (`PROJ-*`, `*`) for flexible matching
- **Catch-all fallback**: Route unmatched projects to a default instance
- **Priority ordering**: First match wins, with catch-all as last resort

### Configuration Management
- **YAML-based configuration**: Easy to read and modify
- **Hot reloading**: Update configuration without restarting
- **Kubernetes ConfigMap integration**: Store configuration in cluster
- **Environment variable fallback**: Default configuration via env vars

### Monitoring & Management
- **Health checks**: Monitor service and downstream instances
- **Route listing**: View all configured routes
- **Status checking**: Check health of all Claude Code instances
- **Manual triggering**: Send custom prompts to specific projects

## 📋 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/jira-webhook` | POST | Main JIRA webhook receiver |
| `/trigger-claude` | POST | Manual Claude triggering |
| `/routes` | GET | List all configured routes |
| `/claude-status` | GET | Check status of all instances |
| `/config/reload` | POST | Reload configuration |

## 🔧 Configuration

### YAML Configuration Format

```yaml
# Project-specific routes
routes:
  - name: "myproject"
    namespace: "claude-dev-myproject"
    agentapi_url: "http://myproject-claude-dev-env-service.claude-dev-myproject.svc.cluster.local:3284"
    jira_projects:
      - "MYPROJ"
      - "PROJ-*"  # Matches PROJ-123, PROJ-456, etc.
    enabled: true

  - name: "frontend-app"
    namespace: "claude-dev-frontend"
    agentapi_url: "http://frontend-claude-dev-env-service.claude-dev-frontend.svc.cluster.local:3284"
    jira_projects:
      - "FRONT"
      - "UI"
    enabled: true

# Catch-all route for unmatched projects
catch_all:
  name: "default-project"
  namespace: "claude-dev"
  agentapi_url: "http://claude-dev-env-service.claude-dev.svc.cluster.local:3284"
  enabled: true
```

### Pattern Matching Rules

- **Exact match**: `"MYPROJ"` matches only `MYPROJ`
- **Wildcard suffix**: `"PROJ-*"` matches `PROJ-123`, `PROJ-456`, etc.
- **Global wildcard**: `"*"` matches any project
- **Case insensitive**: Matching ignores case differences

### Route Priority

1. **Exact matches** are checked first
2. **Pattern matches** are checked second
3. **Catch-all route** is used as last resort

## 🚀 Deployment

### Prerequisites

- Kubernetes cluster
- Docker for building the image
- kubectl configured

### Quick Deployment

```bash
cd kubernetes/webhook-service
./deploy.sh
```

This will:
1. Build the webhook service Docker image
2. Create the `claude-webhook` namespace
3. Deploy the service with default configuration
4. Expose the service via LoadBalancer and NodePort

### Manual Deployment

```bash
# Build the image
cd webhook-service
docker build -t claude-webhook-service:latest .

# Deploy to Kubernetes
cd ../kubernetes/webhook-service
kubectl apply -f namespace.yaml
kubectl apply -k .
```

### Access the Service

```bash
# Using port forwarding
kubectl port-forward svc/webhook-service 5000:80 -n claude-webhook

# Using NodePort
# Access at http://your-node-ip:30500

# Using LoadBalancer (if available)
kubectl get svc webhook-service -n claude-webhook
```

## 🔧 Configuration Management

### Update Routing Configuration

Use the provided script to add new project routes:

```bash
cd kubernetes
./update-webhook-routing.sh \
  --name myproject \
  --namespace claude-dev-myproject \
  --jira-projects "MYPROJ,PROJ-*"
```

### Manual Configuration Update

```bash
# Edit the ConfigMap directly
kubectl edit configmap webhook-routing-config -n claude-webhook

# Restart the service to pick up changes
kubectl rollout restart deployment/webhook-service -n claude-webhook
```

### Hot Reload Configuration

```bash
# Trigger configuration reload without restart
curl -X POST http://webhook-service:5000/config/reload
```

## 🔍 Monitoring

### Health Check

```bash
curl http://webhook-service:5000/health
```

### List Routes

```bash
curl http://webhook-service:5000/routes
```

### Check Claude Status

```bash
curl http://webhook-service:5000/claude-status
```

## 🧪 Testing

### Manual Webhook Trigger

```bash
curl -X POST http://webhook-service:5000/trigger-claude \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Test message for Claude",
    "project": "myproject"
  }'
```

### Test JIRA Webhook

```bash
# Example JIRA webhook payload
curl -X POST http://webhook-service:5000/jira-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhookEvent": "jira:issue_created",
    "issue": {
      "key": "MYPROJ-123",
      "fields": {
        "summary": "Test ticket",
        "description": "Test description",
        "project": {"key": "MYPROJ"},
        "priority": {"name": "High"},
        "assignee": {"displayName": "John Doe"}
      }
    }
  }'
```

## 📊 Logging

The service provides structured logging with the following levels:

- **INFO**: Normal operations, routing decisions
- **WARNING**: Configuration issues, route not found
- **ERROR**: Failed requests, connection issues

View logs:

```bash
kubectl logs -f deployment/webhook-service -n claude-webhook
```

## 🔐 Security Considerations

- Service runs as non-root user
- Configuration stored in Kubernetes ConfigMaps
- Internal service communication via cluster DNS
- Health checks and readiness probes configured
- Resource limits and requests defined

## 🚨 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Route not found | Check JIRA project key matches configuration |
| Connection failed | Verify AgentAPI URL and service DNS names |
| Configuration not loaded | Check ConfigMap exists and is mounted |
| Service not responding | Check pod status and logs |

### Debug Commands

```bash
# Check pod status
kubectl get pods -n claude-webhook

# View pod logs
kubectl logs -f deployment/webhook-service -n claude-webhook

# Check service endpoints
kubectl get endpoints webhook-service -n claude-webhook

# Test internal connectivity
kubectl exec -it deployment/webhook-service -n claude-webhook -- curl localhost:5000/health
```

## 🔄 Integration with Claude Code Projects

When creating a new Claude Code project instance:

1. **Deploy the project** using the project generator
2. **Add webhook routing** to route JIRA tickets to the new instance
3. **Test the routing** with a manual trigger
4. **Configure JIRA** to send webhooks to the webhook service

The webhook service automatically handles routing based on your configuration, making it easy to manage multiple projects from a single endpoint.

## 📚 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `5000` |
| `DEBUG` | Enable debug mode | `false` |
| `JIRA_BASE_URL` | JIRA base URL for ticket links | `https://your-jira.atlassian.net` |
| `DEFAULT_AGENTAPI_URL` | Fallback AgentAPI URL | `http://claude-dev-env-service.claude-dev.svc.cluster.local:3284` |
| `DEFAULT_NAMESPACE` | Fallback namespace | `claude-dev` |