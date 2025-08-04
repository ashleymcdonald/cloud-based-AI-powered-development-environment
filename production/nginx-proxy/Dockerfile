FROM nginx:1.25-alpine

# Install additional packages
RUN apk add --no-cache \
    curl \
    bash \
    gettext \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Install nginx-sso
RUN curl -sSfL https://github.com/Luzifer/nginx-sso/releases/latest/download/nginx-sso_linux_amd64.tar.gz | \
    tar xzf - -C /usr/local/bin/ nginx-sso && \
    chmod +x /usr/local/bin/nginx-sso

# Copy nginx configuration template
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY conf.d/ /etc/nginx/conf.d/

# Copy nginx-sso configuration templates
COPY sso-config/ /etc/nginx-sso/

# Create startup script to process environment variables and start services
RUN cat > /docker-entrypoint.d/30-configure-sso.sh << 'EOF'
#!/bin/bash
set -e

# Set default values
export CLAUDE_NAMESPACE=${CLAUDE_NAMESPACE:-claude-manager}
export SSO_ENABLED=${SSO_ENABLED:-false}
export SSO_PROVIDER=${SSO_PROVIDER:-insecure}

echo "Configuring nginx for namespace: $CLAUDE_NAMESPACE"
echo "SSO enabled: $SSO_ENABLED"
echo "SSO provider: $SSO_PROVIDER"

# Substitute environment variables in nginx config
envsubst '${CLAUDE_NAMESPACE} ${SSO_ENABLED}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Configure nginx-sso if enabled
if [ "$SSO_ENABLED" = "true" ]; then
    echo "Configuring nginx-sso for provider: $SSO_PROVIDER"
    
    # Copy the appropriate SSO config template
    if [ -f "/etc/nginx-sso/${SSO_PROVIDER}.yaml" ]; then
        envsubst < "/etc/nginx-sso/${SSO_PROVIDER}.yaml" > /etc/nginx-sso/config.yaml
        echo "SSO configuration loaded for $SSO_PROVIDER"
    else
        echo "WARNING: SSO config not found for provider $SSO_PROVIDER, using insecure config"
        envsubst < "/etc/nginx-sso/insecure.yaml" > /etc/nginx-sso/config.yaml
    fi
    
    # Start nginx-sso in background
    echo "Starting nginx-sso..."
    /usr/local/bin/nginx-sso --config=/etc/nginx-sso/config.yaml &
    
    # Wait for nginx-sso to be ready
    for i in {1..30}; do
        if curl -s http://localhost:8082/ping > /dev/null 2>&1; then
            echo "nginx-sso is ready"
            break
        fi
        sleep 1
    done
else
    echo "SSO disabled, using direct authentication"
fi

echo "Configuration completed successfully"
EOF

RUN chmod +x /docker-entrypoint.d/30-configure-sso.sh

# Copy the nginx config as template
COPY nginx.conf /etc/nginx/nginx.conf.template

# Create custom error pages
RUN mkdir -p /usr/share/nginx/html/errors

# Custom 401 Unauthorized page
RUN cat > /usr/share/nginx/html/401.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Authentication Required</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            text-align: center; 
            padding: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        }
        .container {
            background: rgba(255,255,255,0.1);
            padding: 40px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .error { color: #ff6b6b; font-size: 2em; margin-bottom: 20px; }
        .suggestion { margin-top: 30px; }
        .suggestion a {
            color: #4ecdc4;
            text-decoration: none;
            padding: 10px 20px;
            margin: 10px;
            border: 2px solid #4ecdc4;
            border-radius: 25px;
            display: inline-block;
            transition: all 0.3s ease;
        }
        .suggestion a:hover {
            background: #4ecdc4;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="error">🔐 Authentication Required</h1>
        <p>You need to authenticate to access Claude Code projects.</p>
        <div class="suggestion">
            <div>
                <a href="/auth/login">🚀 Login</a>
                <a href="/manager/">📱 Manager</a>
            </div>
        </div>
    </div>
</body>
</html>
EOF

# Custom 404 page
RUN cat > /usr/share/nginx/html/404.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Project Not Found</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            text-align: center; 
            padding: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        }
        .container {
            background: rgba(255,255,255,0.1);
            padding: 40px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .error { color: #ff6b6b; font-size: 2em; margin-bottom: 20px; }
        .suggestion { margin-top: 30px; }
        .suggestion a {
            color: #4ecdc4;
            text-decoration: none;
            padding: 10px 20px;
            margin: 10px;
            border: 2px solid #4ecdc4;
            border-radius: 25px;
            display: inline-block;
            transition: all 0.3s ease;
        }
        .suggestion a:hover {
            background: #4ecdc4;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="error">🤖 Project Not Found</h1>
        <p>The requested Claude Code project could not be found.</p>
        <div class="suggestion">
            <p>Available options:</p>
            <div>
                <a href="/manager/">📱 Manager Interface</a>
                <a href="/health">🏥 Health Check</a>
            </div>
        </div>
    </div>
</body>
</html>
EOF

# Custom 50x page
RUN cat > /usr/share/nginx/html/50x.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Service Unavailable</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            text-align: center; 
            padding: 50px;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        }
        .container {
            background: rgba(255,255,255,0.1);
            padding: 40px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .error { color: #ff6b6b; font-size: 2em; margin-bottom: 20px; }
        .suggestion { margin-top: 30px; }
        .suggestion a {
            color: #4ecdc4;
            text-decoration: none;
            padding: 10px 20px;
            border: 2px solid #4ecdc4;
            border-radius: 25px;
            display: inline-block;
            transition: all 0.3s ease;
        }
        .suggestion a:hover {
            background: #4ecdc4;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="error">⚠️ Service Unavailable</h1>
        <p>The Claude Code service is currently unavailable. Please try again later.</p>
        <div class="suggestion">
            <a href="/manager/">Return to Manager</a>
        </div>
    </div>
</body>
</html>
EOF

# Create log directories
RUN mkdir -p /var/log/nginx /var/log/nginx-sso

# Health check script
RUN cat > /usr/local/bin/health-check.sh << 'EOF'
#!/bin/bash
# Health check for nginx with SSO support
set -e

# Check if nginx is running
if ! pgrep nginx > /dev/null; then
    echo "ERROR: nginx process not found"
    exit 1
fi

# Check if nginx responds to health endpoint
if ! curl -f -s --max-time 5 http://localhost/health > /dev/null; then
    echo "ERROR: nginx health endpoint not responding"
    exit 1
fi

# Check nginx-sso if enabled
if [ "$SSO_ENABLED" = "true" ]; then
    if ! pgrep nginx-sso > /dev/null; then
        echo "ERROR: nginx-sso process not found"
        exit 1
    fi
    
    if ! curl -f -s --max-time 5 http://localhost:8082/ping > /dev/null; then
        echo "ERROR: nginx-sso not responding"
        exit 1
    fi
fi

echo "All services healthy"
exit 0
EOF

RUN chmod +x /usr/local/bin/health-check.sh

# Set proper permissions
RUN chown -R nginx:nginx /var/log/nginx /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD /usr/local/bin/health-check.sh || exit 1

# Expose ports (80 for nginx, 8082 for nginx-sso)
EXPOSE 80 443 8082

# Start nginx (the base image handles the entrypoint, nginx-sso starts via init script)
CMD ["nginx", "-g", "daemon off;"]