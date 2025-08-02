from flask import Flask, request, jsonify
import requests
import json
import os

app = Flask(__name__)

AGENTAPI_URL = os.getenv('AGENTAPI_URL', 'http://localhost:3284')
CLAUDE_PROMPT_TEMPLATE = """
New JIRA ticket created: {ticket_key}

Summary: {summary}
Description: {description}
Priority: {priority}
Assignee: {assignee}

Please:
1. Analyze this ticket
2. Create a branch named 'feature/{ticket_key}'
3. Set up initial project structure if needed
4. Create a plan in CLAUDE.md for implementing this feature
5. Start working on the implementation

Ticket URL: {ticket_url}
"""

@app.route('/jira-webhook', methods=['POST'])
def handle_jira_webhook():
    try:
        data = request.get_json()
        
        # Check if this is an issue creation event
        if data.get('webhookEvent') == 'jira:issue_created':
            issue = data.get('issue', {})
            fields = issue.get('fields', {})
            
            # Extract ticket information
            ticket_info = {
                'ticket_key': issue.get('key'),
                'summary': fields.get('summary', ''),
                'description': fields.get('description', ''),
                'priority': fields.get('priority', {}).get('name', 'None'),
                'assignee': fields.get('assignee', {}).get('displayName', 'Unassigned') if fields.get('assignee') else 'Unassigned',
                'ticket_url': f"{os.getenv('JIRA_BASE_URL')}/browse/{issue.get('key')}"
            }
            
            # Create prompt for Claude Code
            prompt = CLAUDE_PROMPT_TEMPLATE.format(**ticket_info)
            
            # Send to Claude Code via AgentAPI
            response = requests.post(
                f"{AGENTAPI_URL}/message",
                json={
                    "content": prompt,
                    "type": "user"
                },
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                return jsonify({
                    "status": "success", 
                    "message": f"Triggered Claude Code for ticket {ticket_info['ticket_key']}"
                })
            else:
                return jsonify({
                    "status": "error", 
                    "message": "Failed to send to Claude Code"
                }), 500
        
        return jsonify({"status": "ignored", "message": "Not an issue creation event"})
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/trigger-claude', methods=['POST'])
def trigger_claude_manual():
    """Manual endpoint to trigger Claude Code with custom prompts"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        
        if not prompt:
            return jsonify({"error": "No prompt provided"}), 400
        
        response = requests.post(
            f"{AGENTAPI_URL}/message",
            json={"content": prompt, "type": "user"},
            headers={'Content-Type': 'application/json'}
        )
        
        return jsonify({
            "status": "success" if response.status_code == 200 else "error",
            "claude_response": response.text
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/claude-status', methods=['GET'])
def claude_status():
    """Check Claude Code status"""
    try:
        response = requests.get(f"{AGENTAPI_URL}/status")
        return jsonify({
            "agentapi_status": response.status_code,
            "claude_status": response.text if response.status_code == 200 else "unavailable"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)