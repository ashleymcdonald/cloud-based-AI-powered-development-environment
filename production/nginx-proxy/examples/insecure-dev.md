# Insecure Development Authentication

⚠️ **WARNING: This configuration is for development and testing only!**

## Overview

The insecure authentication provider allows any username/password combination to authenticate. This is useful for:

- Local development
- Testing SSO integration
- Proof of concept deployments
- CI/CD pipeline testing

**Never use this in production!**

## Configuration

### 1. Enable Insecure Authentication

Update the nginx deployment:

```yaml
env:
- name: SSO_ENABLED
  value: "true"
- name: SSO_PROVIDER
  value: "insecure"
- name: SSO_BASE_URL
  value: "http://projects.internal"
```

### 2. Deploy

```bash
kubectl apply -k production/nginx-proxy/kubernetes/
```

## Usage

### Default Accounts

The insecure provider includes these predefined accounts:

- **admin** / **admin** - Administrator account
- **developer** / **developer** - Developer account  
- **user** / **user** - Standard user account

### Wildcard Authentication

Any username/password combination will work:

- **john** / **password123** ✅
- **mary** / **secret** ✅
- **test** / **test** ✅
- **anything** / **anything** ✅

## Features

- ✅ **No Setup Required**: Works out of the box
- ✅ **Any Credentials**: Accepts any username/password
- ✅ **Quick Testing**: Perfect for development
- ✅ **Audit Logging**: Still logs all authentication attempts
- ✅ **Session Management**: Same session handling as real providers

## Development Workflow

### 1. Quick Start

```bash
# Enable insecure auth
kubectl patch deployment nginx-proxy -n claude-manager -p '
{
  "spec": {
    "template": {
      "spec": {
        "containers": [{
          "name": "nginx-proxy",
          "env": [
            {"name": "SSO_ENABLED", "value": "true"},
            {"name": "SSO_PROVIDER", "value": "insecure"}
          ]
        }]
      }
    }
  }
}'

# Test access
curl -I http://projects.internal/manager/
# Should redirect to login page

# Login with any credentials
curl -X POST http://projects.internal/login \
  -d "username=test&password=test" \
  -c cookies.txt

# Access protected resource
curl -b cookies.txt http://projects.internal/manager/
```

### 2. Testing SSO Integration

```bash
# Test manager interface
open http://projects.internal/manager/

# Test project access
open http://projects.internal/myproject/

# Test API access
curl -b cookies.txt http://projects.internal/api/projects
```

## Security Warnings

### ⚠️ Production Risks

- **No real authentication**: Anyone can access
- **Credential logging**: Passwords may appear in logs
- **Session hijacking**: No protection against session attacks
- **Data exposure**: All data accessible to anyone

### 🔒 Migration to Production

Before going to production:

1. **Choose real SSO provider** (Google, GitHub, Azure, etc.)
2. **Update configuration** with proper credentials
3. **Test authentication** with real accounts
4. **Enable HTTPS** and secure cookies
5. **Audit access controls** and permissions

## Disabling Insecure Auth

### Switch to Real SSO

```yaml
env:
- name: SSO_ENABLED
  value: "true"
- name: SSO_PROVIDER
  value: "google"  # or github, azure, okta, ldap
# Add provider-specific configuration
```

### Disable SSO Completely

```yaml
env:
- name: SSO_ENABLED
  value: "false"
```

## Troubleshooting

**Login page not appearing:**
- Check SSO_ENABLED is "true"
- Verify nginx-sso is running: `kubectl logs deployment/nginx-proxy -n claude-manager`

**Cannot access after login:**
- Check cookie settings
- Verify session is created
- Test with curl and cookies

**Want to test specific usernames:**
- Use predefined accounts (admin/admin, etc.)
- Any combination works - use meaningful names for testing