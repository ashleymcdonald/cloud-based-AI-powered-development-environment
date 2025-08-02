from flask import Flask, request, jsonify
import requests
import json
import os
import yaml
import logging
from typing import Dict, Optional, List
import re
from dataclasses import dataclass

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@dataclass
class ProjectRoute:
    name: str
    namespace: str
    agentapi_url: str
    jira_projects: List[str]
    enabled: bool = True

class WebhookRouter:
    def __init__(self, config_path: str = '/config/routing.yaml'):
        self.config_path = config_path
        self.routes: Dict[str, ProjectRoute] = {}
        self.catch_all_route: Optional[ProjectRoute] = None
        self.load_config()

    def load_config(self):
        """Load routing configuration from YAML file"""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    config = yaml.safe_load(f)
                    
                # Load project routes
                for route_config in config.get('routes', []):
                    route = ProjectRoute(
                        name=route_config['name'],
                        namespace=route_config['namespace'],
                        agentapi_url=route_config['agentapi_url'],
                        jira_projects=route_config.get('jira_projects', []),
                        enabled=route_config.get('enabled', True)
                    )
                    self.routes[route.name] = route
                    logger.info(f"Loaded route for project: {route.name}")
                
                # Load catch-all route
                catch_all_config = config.get('catch_all')
                if catch_all_config:
                    self.catch_all_route = ProjectRoute(
                        name=catch_all_config['name'],
                        namespace=catch_all_config['namespace'],
                        agentapi_url=catch_all_config['agentapi_url'],
                        jira_projects=['*'],
                        enabled=catch_all_config.get('enabled', True)
                    )
                    logger.info(f"Loaded catch-all route: {self.catch_all_route.name}")
                    
                logger.info(f"Loaded {len(self.routes)} project routes and catch-all route")
            else:
                logger.warning(f"Config file not found: {self.config_path}. Using environment variables.")
                self._load_from_env()
                
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            self._load_from_env()

    def _load_from_env(self):
        """Fallback to environment variables for configuration"""
        default_url = os.getenv('DEFAULT_AGENTAPI_URL', 'http://claude-dev-env-service.claude-dev.svc.cluster.local:3284')
        default_namespace = os.getenv('DEFAULT_NAMESPACE', 'claude-dev')
        
        if default_url:
            self.catch_all_route = ProjectRoute(
                name='default',
                namespace=default_namespace,
                agentapi_url=default_url,
                jira_projects=['*'],
                enabled=True
            )
            logger.info(f"Using default catch-all route from environment: {default_url}")

    def find_route_for_project(self, jira_project_key: str) -> Optional[ProjectRoute]:
        """Find the appropriate route for a JIRA project"""
        
        # First, check for exact project matches
        for route in self.routes.values():
            if not route.enabled:
                continue
            if jira_project_key in route.jira_projects:
                logger.info(f"Found exact match for project {jira_project_key}: {route.name}")
                return route
        
        # Then, check for pattern matches (e.g., "PROJ-*" matches "PROJ-123")
        for route in self.routes.values():
            if not route.enabled:
                continue
            for pattern in route.jira_projects:
                if self._match_pattern(pattern, jira_project_key):
                    logger.info(f"Found pattern match for project {jira_project_key}: {route.name} (pattern: {pattern})")
                    return route
        
        # Finally, use catch-all route if available
        if self.catch_all_route and self.catch_all_route.enabled:
            logger.info(f"Using catch-all route for project {jira_project_key}: {self.catch_all_route.name}")
            return self.catch_all_route
        
        logger.warning(f"No route found for project: {jira_project_key}")
        return None

    def _match_pattern(self, pattern: str, project_key: str) -> bool:
        """Check if project key matches pattern (supports wildcards)"""
        if pattern == '*':
            return True
        
        # Convert wildcard pattern to regex
        regex_pattern = pattern.replace('*', '.*').replace('?', '.')
        return bool(re.match(f'^{regex_pattern}$', project_key, re.IGNORECASE))

    def reload_config(self):
        """Reload configuration (useful for config updates)"""
        logger.info("Reloading configuration...")
        self.routes.clear()
        self.catch_all_route = None
        self.load_config()

# Global router instance
router = WebhookRouter()

# Claude prompt templates
CLAUDE_PROMPT_TEMPLATES = {
    'issue_created': """
New JIRA ticket created: {ticket_key}

Summary: {summary}
Description: {description}
Priority: {priority}
Assignee: {assignee}
Project: {project_key}

Please:
1. Analyze this ticket
2. Create a branch named 'feature/{ticket_key}'
3. Set up initial project structure if needed
4. Create a plan in CLAUDE.md for implementing this feature
5. Start working on the implementation

Ticket URL: {ticket_url}
""",
    
    'issue_updated': """
JIRA ticket updated: {ticket_key}

Summary: {summary}
Description: {description}
Priority: {priority}
Status: {status}
Assignee: {assignee}
Project: {project_key}

Changes made:
{changelog}

Please:
1. Review the changes to this ticket
2. Update your implementation plan if needed
3. Continue or adjust your work based on the updates

Ticket URL: {ticket_url}
""",

    'issue_assigned': """
JIRA ticket assigned to you: {ticket_key}

Summary: {summary}
Description: {description}
Priority: {priority}
Assignee: {assignee}
Project: {project_key}

Please:
1. Review this newly assigned ticket
2. Create a branch named 'feature/{ticket_key}' if it doesn't exist
3. Create or update your implementation plan
4. Begin work on the ticket

Ticket URL: {ticket_url}
"""
}

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "routes_loaded": len(router.routes),
        "catch_all_enabled": router.catch_all_route is not None
    })

@app.route('/config/reload', methods=['POST'])
def reload_config():
    """Reload configuration endpoint"""
    try:
        router.reload_config()
        return jsonify({
            "status": "success",
            "message": "Configuration reloaded",
            "routes_loaded": len(router.routes)
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/routes', methods=['GET'])
def list_routes():
    """List all configured routes"""
    routes_info = []
    
    for route in router.routes.values():
        routes_info.append({
            "name": route.name,
            "namespace": route.namespace,
            "agentapi_url": route.agentapi_url,
            "jira_projects": route.jira_projects,
            "enabled": route.enabled
        })
    
    catch_all_info = None
    if router.catch_all_route:
        catch_all_info = {
            "name": router.catch_all_route.name,
            "namespace": router.catch_all_route.namespace,
            "agentapi_url": router.catch_all_route.agentapi_url,
            "enabled": router.catch_all_route.enabled
        }
    
    return jsonify({
        "routes": routes_info,
        "catch_all": catch_all_info
    })

@app.route('/jira-webhook', methods=['POST'])
def handle_jira_webhook():
    """Main JIRA webhook handler with routing"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"status": "error", "message": "No JSON data provided"}), 400
        
        webhook_event = data.get('webhookEvent', '')
        issue = data.get('issue', {})
        
        if not issue:
            return jsonify({"status": "ignored", "message": "No issue data in webhook"}), 200
        
        # Extract issue information
        fields = issue.get('fields', {})
        project = fields.get('project', {})
        project_key = project.get('key', 'UNKNOWN')
        ticket_key = issue.get('key', 'UNKNOWN')
        
        logger.info(f"Received webhook event: {webhook_event} for ticket: {ticket_key} (project: {project_key})")
        
        # Find the appropriate route
        target_route = router.find_route_for_project(project_key)
        
        if not target_route:
            logger.warning(f"No route found for project {project_key}, ignoring webhook")
            return jsonify({
                "status": "ignored", 
                "message": f"No route configured for project: {project_key}"
            }), 200
        
        # Determine the prompt template based on webhook event
        template_key = 'issue_created'  # default
        if 'updated' in webhook_event.lower():
            template_key = 'issue_updated'
        elif 'assigned' in webhook_event.lower():
            template_key = 'issue_assigned'
        
        # Extract ticket information
        ticket_info = {
            'ticket_key': ticket_key,
            'project_key': project_key,
            'summary': fields.get('summary', ''),
            'description': fields.get('description', ''),
            'priority': fields.get('priority', {}).get('name', 'None'),
            'status': fields.get('status', {}).get('name', 'Unknown'),
            'assignee': fields.get('assignee', {}).get('displayName', 'Unassigned') if fields.get('assignee') else 'Unassigned',
            'ticket_url': f"{os.getenv('JIRA_BASE_URL', 'https://your-jira.atlassian.net')}/browse/{ticket_key}",
            'changelog': _extract_changelog(data) if 'updated' in webhook_event.lower() else ''
        }
        
        # Create prompt for Claude Code
        prompt_template = CLAUDE_PROMPT_TEMPLATES.get(template_key, CLAUDE_PROMPT_TEMPLATES['issue_created'])
        prompt = prompt_template.format(**ticket_info)
        
        # Send to Claude Code via AgentAPI
        try:
            response = requests.post(
                f"{target_route.agentapi_url}/message",
                json={
                    "content": prompt,
                    "type": "user"
                },
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully sent webhook to {target_route.name} for ticket {ticket_key}")
                return jsonify({
                    "status": "success", 
                    "message": f"Routed to project: {target_route.name}",
                    "ticket": ticket_key,
                    "project": project_key,
                    "route": target_route.name
                })
            else:
                logger.error(f"Failed to send to AgentAPI: {response.status_code} - {response.text}")
                return jsonify({
                    "status": "error", 
                    "message": f"Failed to send to Claude Code: {response.status_code}"
                }), 500
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed to {target_route.agentapi_url}: {e}")
            return jsonify({
                "status": "error", 
                "message": f"Failed to connect to AgentAPI: {str(e)}"
            }), 500
        
    except Exception as e:
        logger.error(f"Error processing webhook: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/trigger-claude', methods=['POST'])
def trigger_claude_manual():
    """Manual endpoint to trigger Claude Code with custom prompts"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        project_name = data.get('project', '')
        
        if not prompt:
            return jsonify({"error": "No prompt provided"}), 400
        
        # Find route by project name or use catch-all
        target_route = None
        if project_name:
            target_route = router.routes.get(project_name)
        
        if not target_route:
            target_route = router.catch_all_route
        
        if not target_route:
            return jsonify({"error": "No route available"}), 400
        
        response = requests.post(
            f"{target_route.agentapi_url}/message",
            json={"content": prompt, "type": "user"},
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        return jsonify({
            "status": "success" if response.status_code == 200 else "error",
            "route": target_route.name,
            "claude_response": response.text
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/claude-status', methods=['GET'])
def claude_status():
    """Check Claude Code status for all routes"""
    status_info = {}
    
    # Check all configured routes
    for route in router.routes.values():
        if not route.enabled:
            status_info[route.name] = {"status": "disabled"}
            continue
            
        try:
            response = requests.get(f"{route.agentapi_url}/status", timeout=10)
            status_info[route.name] = {
                "status": "online" if response.status_code == 200 else "error",
                "response_code": response.status_code,
                "namespace": route.namespace
            }
        except Exception as e:
            status_info[route.name] = {
                "status": "offline",
                "error": str(e),
                "namespace": route.namespace
            }
    
    # Check catch-all route
    if router.catch_all_route and router.catch_all_route.enabled:
        try:
            response = requests.get(f"{router.catch_all_route.agentapi_url}/status", timeout=10)
            status_info["catch_all"] = {
                "status": "online" if response.status_code == 200 else "error",
                "response_code": response.status_code,
                "namespace": router.catch_all_route.namespace
            }
        except Exception as e:
            status_info["catch_all"] = {
                "status": "offline",
                "error": str(e),
                "namespace": router.catch_all_route.namespace
            }
    
    return jsonify(status_info)

def _extract_changelog(webhook_data):
    """Extract meaningful changelog from webhook data"""
    changelog = webhook_data.get('changelog', {})
    items = changelog.get('items', [])
    
    changes = []
    for item in items:
        field = item.get('field', '')
        from_val = item.get('fromString', 'None')
        to_val = item.get('toString', 'None')
        changes.append(f"- {field}: {from_val} → {to_val}")
    
    return '\n'.join(changes) if changes else 'No specific changes detected'

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)