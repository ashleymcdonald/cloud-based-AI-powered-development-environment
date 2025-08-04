# Google OAuth2 SSO Configuration

## Setup Google OAuth2 Application

### 1. Create OAuth2 Application

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth 2.0 Client IDs**
5. Choose **Web application**
6. Configure:
   - **Name**: Claude Code SSO
   - **Authorized JavaScript origins**: `http://projects.internal` (or your domain)
   - **Authorized redirect URIs**: `http://projects.internal/auth/google`

### 2. Configure Claude Code

Update the nginx deployment environment variables:

```yaml
env:
- name: SSO_ENABLED
  value: "true"
- name: SSO_PROVIDER
  value: "google"
- name: SSO_BASE_URL
  value: "http://projects.internal"
- name: GOOGLE_ALLOWED_DOMAIN
  value: "your-company.com"  # Optional: restrict to company domain
```

### 3. Create Kubernetes Secret

```bash
kubectl create secret generic nginx-sso-secrets \
  --from-literal=google-client-id="your-client-id.apps.googleusercontent.com" \
  --from-literal=google-client-secret="your-client-secret" \
  -n claude-manager
```

### 4. Deploy and Test

```bash
# Apply the configuration
kubectl apply -k production/nginx-proxy/kubernetes/

# Check if SSO is working
curl -I http://projects.internal/manager/
# Should return 302 redirect to Google OAuth
```

## Features

- ✅ **Domain Restriction**: Limit access to specific Google Workspace domains
- ✅ **Group Membership**: (Optional) Restrict based on Google Groups
- ✅ **Audit Logging**: All authentication events logged
- ✅ **Session Management**: Configurable cookie expiration

## Security Considerations

- Use HTTPS in production (`SSO_COOKIE_SECURE=true`)
- Set appropriate cookie domain (`.your-domain.com`)
- Configure proper redirect URIs
- Enable Google Workspace domain restrictions

## Troubleshooting

**"redirect_uri_mismatch" Error:**
- Verify redirect URI in Google Console matches exactly
- Check protocol (http vs https)

**"access_denied" Error:**
- Check domain restrictions in configuration
- Verify user has access to Google Workspace domain

**Users Not Authenticated:**
- Check nginx-sso logs: `kubectl logs deployment/nginx-proxy -n claude-manager`
- Verify secret exists: `kubectl get secret nginx-sso-secrets -n claude-manager`