# 🌐 Nginx Reverse Proxy

Production-ready Nginx reverse proxy for the Claude Code platform with single namespace architecture and dynamic project routing.

## 🏗️ Architecture

### Single Namespace Routing
Routes requests to `project-[shortname]-service.[namespace].svc.cluster.local` services within a single configurable namespace.

```
projects.internal/
├── /                          → Redirect to /manager/
├── /manager/                  → Claude Manager dashboard
├── /api/                      → Manager API endpoints
├── /socket.io/               → Manager WebSocket connections
├── /[project-name]/          → Project VS Code interface
├── /[project-name]/api/      → Project Claude Code API
├── /[project-name]/dev/      → Project development server
└── /health                   → Health check endpoint
```

### Service Discovery
- **Manager**: `claude-manager-service.[namespace].svc.cluster.local:3000`
- **Projects**: `project-[shortname]-service.[namespace].svc.cluster.local:8443`
- **Project APIs**: `project-[shortname]-service.[namespace].svc.cluster.local:3284`
- **Dev Servers**: `project-[shortname]-service.[namespace].svc.cluster.local:3000`

## 🚀 Features

### Dynamic Routing
- **Project Detection**: Extracts project name from URL path
- **Service Type Detection**: Routes to appropriate service ports
- **Namespace Awareness**: Configurable via `CLAUDE_NAMESPACE` environment variable
- **Health Checks**: Individual project health monitoring

### Production Optimizations
- **HTTP/2 Support**: Modern protocol support
- **Gzip Compression**: Optimized content delivery
- **Rate Limiting**: API and login protection
- **Security Headers**: XSS, CSRF, and content type protection
- **Caching**: Optimized buffer and cache settings

### Monitoring
- **Access Logs**: Detailed request logging with project tracking
- **Nginx Status**: `/nginx_status` endpoint for monitoring
- **Health Checks**: Built-in health monitoring
- **Error Pages**: Custom branded error pages

## 🔧 Configuration

### Environment Variables

```bash
# Kubernetes namespace (auto-detected from pod metadata)
CLAUDE_NAMESPACE=claude-manager

# Nginx tuning
NGINX_WORKER_PROCESSES=auto
NGINX_WORKER_CONNECTIONS=1024
```

### URL Patterns

| URL Pattern | Target Service | Port | Description |
|-------------|---------------|------|-------------|
| `/` | - | - | Redirect to `/manager/` |
| `/manager/*` | claude-manager-service | 3000 | Management interface |
| `/api/*` | claude-manager-service | 3000 | Manager API |
| `/socket.io/*` | claude-manager-service | 3000 | Manager WebSockets |
| `/[project]/*` | project-[project]-service | 8443 | VS Code interface |
| `/[project]/api/*` | project-[project]-service | 3284 | Claude Code API |
| `/[project]/dev/*` | project-[project]-service | 3000 | Development server |

### Example Routing

```bash
# Manager access
https://projects.internal/manager/ → claude-manager-service.claude-manager.svc.cluster.local:3000

# Project "myapp" VS Code
https://projects.internal/myapp/ → project-myapp-service.claude-manager.svc.cluster.local:8443

# Project "myapp" Claude Code API
https://projects.internal/myapp/api/ → project-myapp-service.claude-manager.svc.cluster.local:3284

# Project "frontend" development server
https://projects.internal/frontend/dev/ → project-frontend-service.claude-manager.svc.cluster.local:3000
```

## 🐳 Building and Deployment

### Build Image

```bash
cd production/nginx-proxy/

# Build the image
docker build -t claude-nginx-proxy:latest .

# Tag for registry
docker tag claude-nginx-proxy:latest your-registry/claude-nginx-proxy:v1.0.0

# Push to registry
docker push your-registry/claude-nginx-proxy:v1.0.0
```

### Deploy to Kubernetes

```bash
cd kubernetes/

# Deploy using Kustomize
kubectl apply -k .

# Or deploy manually
kubectl apply -f namespace.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

### Configuration Updates

```bash
# Update namespace in deployment
kubectl patch deployment nginx-proxy -n claude-manager -p '
{
  "spec": {
    "template": {
      "spec": {
        "containers": [{
          "name": "nginx-proxy",
          "env": [{
            "name": "CLAUDE_NAMESPACE",
            "value": "my-custom-namespace"
          }]
        }]
      }
    }
  }
}'
```

## 📊 Monitoring

### Health Checks

```bash
# Nginx health
curl http://nginx-proxy-service/health

# Nginx status
curl http://nginx-proxy-service/nginx_status

# Project health
curl http://nginx-proxy-service/myproject/health
```

### Logs

```bash
# Access logs
kubectl logs deployment/nginx-proxy -n claude-manager -f

# Error logs  
kubectl logs deployment/nginx-proxy -n claude-manager | grep ERROR

# Project-specific logs (from access logs)
kubectl logs deployment/nginx-proxy -n claude-manager | grep 'project="myproject"'
```

### Metrics

Nginx exports metrics via the `/nginx_status` endpoint:
- Active connections
- Request statistics
- Connection states

## 🔐 Security

### Network Security
- **Rate Limiting**: Login (5 req/min), API (100 req/min)
- **Security Headers**: XSS protection, content type sniffing prevention
- **Access Control**: Internal network access only for metrics
- **Hidden File Protection**: Blocks access to dotfiles

### SSL/TLS (Optional)
Uncomment HTTPS server block in `nginx.conf` and provide certificates:

```bash
# Create TLS secret
kubectl create secret tls nginx-tls \
  --cert=path/to/cert.pem \
  --key=path/to/key.pem \
  -n claude-manager

# Mount in deployment
volumeMounts:
- name: tls-certs
  mountPath: /etc/ssl/certs
  readOnly: true
```

## 🚨 Troubleshooting

### Common Issues

**502 Bad Gateway:**
```bash
# Check backend services
kubectl get svc -n claude-manager | grep project-

# Check service endpoints
kubectl get endpoints -n claude-manager

# Check if project pods are running
kubectl get pods -n claude-manager | grep project-
```

**404 Not Found:**
```bash
# Check nginx config
kubectl exec deployment/nginx-proxy -n claude-manager -- nginx -t

# Check URL patterns in logs
kubectl logs deployment/nginx-proxy -n claude-manager | tail -20
```

**Connection Issues:**
```bash
# Check nginx status
kubectl exec deployment/nginx-proxy -n claude-manager -- curl http://localhost/health

# Check DNS resolution
kubectl exec deployment/nginx-proxy -n claude-manager -- nslookup claude-manager-service.claude-manager.svc.cluster.local
```

### Debug Mode

Enable debug logging:

```bash
kubectl patch deployment nginx-proxy -n claude-manager -p '
{
  "spec": {
    "template": {
      "spec": {
        "containers": [{
          "name": "nginx-proxy",
          "env": [{
            "name": "NGINX_LOG_LEVEL",
            "value": "debug"
          }]
        }]
      }
    }
  }
}'
```

## 📋 Configuration Files

- **`nginx.conf`**: Main configuration with single namespace routing
- **`conf.d/proxy_params.conf`**: Proxy header configurations
- **`kubernetes/deployment.yaml`**: Kubernetes deployment with namespace detection
- **`kubernetes/service.yaml`**: Load balancer service configuration

## 🔄 Updates and Maintenance

### Rolling Updates
```bash
# Update image
kubectl set image deployment/nginx-proxy nginx-proxy=claude-nginx-proxy:v1.1.0 -n claude-manager

# Check rollout status
kubectl rollout status deployment/nginx-proxy -n claude-manager
```

### Configuration Reload
```bash
# Reload nginx config (if changed)
kubectl exec deployment/nginx-proxy -n claude-manager -- nginx -s reload
```

---

**Optimized for single namespace architecture with dynamic project routing** 🚀