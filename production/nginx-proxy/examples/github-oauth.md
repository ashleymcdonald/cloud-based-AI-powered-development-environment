# GitHub OAuth2 SSO Configuration

## Setup GitHub OAuth App

### 1. Create OAuth App

1. Go to GitHub Settings > **Developer settings** > **OAuth Apps**
2. Click **New OAuth App**
3. Configure:
   - **Application name**: Claude Code SSO
   - **Homepage URL**: `http://projects.internal`
   - **Authorization callback URL**: `http://projects.internal/auth/github`

### 2. Configure Claude Code

Update the nginx deployment environment variables:

```yaml
env:
- name: SSO_ENABLED
  value: "true"
- name: SSO_PROVIDER
  value: "github"
- name: SSO_BASE_URL
  value: "http://projects.internal"
- name: GITHUB_ALLOWED_ORGS
  value: "your-org,another-org"  # Optional: restrict to specific orgs
```

### 3. Create Kubernetes Secret

```bash
kubectl create secret generic nginx-sso-secrets \
  --from-literal=github-client-id="your-github-client-id" \
  --from-literal=github-client-secret="your-github-client-secret" \
  -n claude-manager
```

### 4. Organization Access (Optional)

For organization-based access control:

1. Go to your GitHub organization settings
2. Navigate to **Third-party access**
3. Configure OAuth app policy
4. Update the nginx-sso configuration to include organization checks

## Advanced Configuration

### Team-based Access Control

Update the GitHub SSO config to include team restrictions:

```yaml
# In sso-config/github.yaml
providers:
  github:
    client_id: "${GITHUB_CLIENT_ID}"
    client_secret: "${GITHUB_CLIENT_SECRET}"
    redirect_url: "${SSO_BASE_URL}/auth"
    organizations: ["your-org"]
    teams: ["your-org/developers", "your-org/admins"]
```

### Environment Variables

```bash
# Organization restrictions
GITHUB_ALLOWED_ORGS=your-org,partner-org

# Team restrictions (requires organization membership)
GITHUB_ALLOWED_TEAMS=your-org/developers,your-org/admins
```

## Features

- ✅ **Organization Membership**: Restrict to GitHub organization members
- ✅ **Team Membership**: Fine-grained access control via teams
- ✅ **Public/Private Repos**: Access control based on repository permissions
- ✅ **Audit Logging**: All authentication events logged

## Security Considerations

- Use HTTPS in production
- Restrict to specific organizations/teams
- Enable organization SSO if using GitHub Enterprise
- Review third-party application access regularly

## Troubleshooting

**"Application not approved" Error:**
- Check organization OAuth app policy
- Ensure app is approved for organization use

**"Not a member of required organization" Error:**
- Verify user is member of specified organization
- Check organization visibility settings
- Confirm organization names in configuration

**Authentication Loop:**
- Check callback URL configuration
- Verify nginx-sso is receiving callbacks
- Check logs: `kubectl logs deployment/nginx-proxy -n claude-manager`

## GitHub Enterprise Server

For GitHub Enterprise Server:

```yaml
env:
- name: GITHUB_BASE_URL
  value: "https://github.your-company.com"
- name: GITHUB_API_URL
  value: "https://github.your-company.com/api/v3"
```