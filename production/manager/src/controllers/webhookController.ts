import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { ProjectService } from '@/services/projectService';
import { ApiResponse } from '@/types/api';
import { webhookLogger, logWebhookEvent, logError } from '@/utils/logger';
import { webhookRequestsTotal, webhookProcessingDuration } from '@/utils/metrics';
import axios from 'axios';

export class WebhookController {
  private projectService: ProjectService;

  constructor() {
    this.projectService = new ProjectService();
  }

  // JIRA webhook handler with automatic project creation
  handleJiraWebhook = async (req: Request, res: Response): Promise<void> => {
    const timer = webhookProcessingDuration.startTimer({ source: 'jira', event_type: 'webhook' });
    
    try {
      const webhookData = req.body;
      
      if (!webhookData) {
        res.status(400).json({
          success: false,
          error: 'No webhook data provided',
          timestamp: new Date().toISOString()
        } as ApiResponse);
        return;
      }

      const webhookEvent = webhookData.webhookEvent || '';
      const issue = webhookData.issue || {};
      const fields = issue.fields || {};
      const project = fields.project || {};

      const projectKey = project.key;
      const issueKey = issue.key;
      
      logWebhookEvent('jira', webhookEvent, { issueKey, projectKey });
      webhookRequestsTotal.inc({ source: 'jira', event_type: webhookEvent, status: 'processing' });

      // Check if this is an issue creation event
      if (webhookEvent === 'jira:issue_created') {
        await this.handleIssueCreated(webhookData);
      } else if (webhookEvent.includes('updated')) {
        await this.handleIssueUpdated(webhookData);
      }

      // Route to appropriate Claude Code instance
      await this.routeToClaudeCode(webhookData);

      timer({ status: 'success' });
      webhookRequestsTotal.inc({ source: 'jira', event_type: webhookEvent, status: 'success' });
      
      res.json({
        success: true,
        message: 'Webhook processed successfully',
        data: {
          event: webhookEvent,
          issue: issueKey,
          project: projectKey
        },
        timestamp: new Date().toISOString()
      } as ApiResponse);

    } catch (error) {
      timer({ status: 'error' });
      webhookRequestsTotal.inc({ source: 'jira', event_type: 'unknown', status: 'error' });
      logError(error, { context: 'jira-webhook' });
      
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }
  };

  private async handleIssueCreated(webhookData: any): Promise<void> {
    const issue = webhookData.issue || {};
    const fields = issue.fields || {};
    const project = fields.project || {};
    const projectKey = project.key;
    
    // Check if we have a Claude Code project for this JIRA project
    const projects = await this.projectService.listProjects(1, 100);
    const existingProject = projects.projects.find(p => 
      p.jiraConfig?.projectKeys.includes(projectKey)
    );

    if (existingProject) {
      this.logger.info(`Found existing project for JIRA project ${projectKey}: ${existingProject.name}`);
      return;
    }

    // Check if auto-creation is enabled and we have the necessary configuration
    const autoCreateEnabled = process.env.AUTO_CREATE_PROJECTS === 'true';
    if (!autoCreateEnabled) {
      this.logger.info(`Auto-creation disabled for JIRA project ${projectKey}`);
      return;
    }

    // Extract repository URL from issue description or custom fields
    const gitRepository = this.extractGitRepository(fields);
    if (!gitRepository) {
      this.logger.warn(`No git repository found for JIRA project ${projectKey}, skipping auto-creation`);
      return;
    }

    try {
      // Create new Claude Code project automatically
      const projectName = `${project.name} - Auto Created`;
      const shortName = projectKey.toLowerCase();
      
      const newProject = await this.projectService.createProject({
        name: projectName,
        shortName,
        gitRepository,
        anthropicApiKey: process.env.DEFAULT_ANTHROPIC_API_KEY || '',
        codeServerPassword: this.generateRandomPassword(),
        sudoPassword: this.generateRandomPassword(),
        jiraProjectKeys: [projectKey],
        jiraConfig: {
          baseUrl: process.env.JIRA_BASE_URL || '',
          email: process.env.JIRA_EMAIL || '',
          apiKey: process.env.JIRA_API_KEY || '',
          projectKeys: [projectKey]
        }
      });

      this.logger.info(`Auto-created project ${newProject.name} for JIRA project ${projectKey}`);

    } catch (error) {
      this.logger.error(`Failed to auto-create project for JIRA project ${projectKey}:`, error);
    }
  }

  private async handleIssueUpdated(webhookData: any): Promise<void> {
    // Handle issue updates - could trigger additional automations
    const issue = webhookData.issue || {};
    const changelog = webhookData.changelog || {};
    
    this.logger.info(`Issue updated: ${issue.key}`, {
      changes: changelog.items?.map((item: any) => ({
        field: item.field,
        from: item.fromString,
        to: item.toString
      }))
    });
  }

  private async routeToClaudeCode(webhookData: any): Promise<void> {
    const issue = webhookData.issue || {};
    const fields = issue.fields || {};
    const project = fields.project || {};
    const projectKey = project.key;
    
    // Find the Claude Code project that handles this JIRA project
    const projects = await this.projectService.listProjects(1, 100);
    const targetProject = projects.projects.find(p => 
      p.jiraConfig?.projectKeys.includes(projectKey) ||
      p.jiraConfig?.projectKeys.includes('*') // Wildcard match
    );

    if (!targetProject) {
      this.logger.warn(`No Claude Code project found for JIRA project ${projectKey}`);
      return;
    }

    if (targetProject.status !== 'running') {
      this.logger.warn(`Target project ${targetProject.name} is not running (status: ${targetProject.status})`);
      return;
    }

    // Generate Claude prompt based on webhook event
    const prompt = this.generateClaudePrompt(webhookData);
    
    // Send to Claude Code via AgentAPI
    try {
      const agentApiUrl = targetProject.urls?.agentapi || 
        `http://${targetProject.shortName}-claude-dev-env-service.${targetProject.namespace}.svc.cluster.local:3284`;
      
      const response = await axios.post(`${agentApiUrl}/message`, {
        content: prompt,
        type: 'user'
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      this.logger.info(`Successfully routed webhook to project ${targetProject.name}`);

    } catch (error) {
      this.logger.error(`Failed to route webhook to project ${targetProject.name}:`, error);
    }
  }

  private extractGitRepository(fields: any): string | null {
    // Try to extract git repository from various fields
    
    // Check custom fields (common field names for git repository)
    const customFields = [
      'customfield_10001', // Common Git URL field
      'customfield_10002',
      'customfield_10100'
    ];

    for (const fieldKey of customFields) {
      const value = fields[fieldKey];
      if (value && typeof value === 'string' && this.isGitUrl(value)) {
        return value;
      }
    }

    // Check description for git URLs
    const description = fields.description || '';
    const gitUrlMatch = description.match(/(https?:\/\/[^\s]+\.git|git@[^\s]+\.git|https?:\/\/github\.com\/[^\s]+|https?:\/\/gitlab\.com\/[^\s]+|https?:\/\/bitbucket\.org\/[^\s]+)/);
    if (gitUrlMatch) {
      return gitUrlMatch[1];
    }

    // Check if project name matches a known repository pattern
    const projectName = fields.project?.name || '';
    if (process.env.DEFAULT_GIT_ORG) {
      // Construct git URL from project name
      const repoName = projectName.toLowerCase().replace(/\s+/g, '-');
      return `https://github.com/${process.env.DEFAULT_GIT_ORG}/${repoName}.git`;
    }

    return null;
  }

  private isGitUrl(url: string): boolean {
    return /^(https?:\/\/|git@).+\.git$/.test(url) ||
           /^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//.test(url);
  }

  private generateClaudePrompt(webhookData: any): string {
    const webhookEvent = webhookData.webhookEvent || '';
    const issue = webhookData.issue || {};
    const fields = issue.fields || {};
    const project = fields.project || {};

    const ticketInfo = {
      ticketKey: issue.key || 'UNKNOWN',
      projectKey: project.key || 'UNKNOWN',
      summary: fields.summary || '',
      description: fields.description || '',
      priority: fields.priority?.name || 'None',
      status: fields.status?.name || 'Unknown',
      assignee: fields.assignee?.displayName || 'Unassigned',
      ticketUrl: `${process.env.JIRA_BASE_URL || 'https://your-jira.atlassian.net'}/browse/${issue.key}`
    };

    if (webhookEvent === 'jira:issue_created') {
      return `
New JIRA ticket created: ${ticketInfo.ticketKey}

Summary: ${ticketInfo.summary}
Description: ${ticketInfo.description}
Priority: ${ticketInfo.priority}
Assignee: ${ticketInfo.assignee}
Project: ${ticketInfo.projectKey}

Please:
1. Analyze this ticket and understand the requirements
2. Create a branch named 'feature/${ticketInfo.ticketKey}'
3. Set up initial project structure if needed
4. Create a development plan in CLAUDE.md
5. Begin working on the implementation

Ticket URL: ${ticketInfo.ticketUrl}
`;
    } else if (webhookEvent.includes('updated')) {
      const changelog = this.extractChangelog(webhookData);
      return `
JIRA ticket updated: ${ticketInfo.ticketKey}

Summary: ${ticketInfo.summary}
Description: ${ticketInfo.description}
Priority: ${ticketInfo.priority}
Status: ${ticketInfo.status}
Assignee: ${ticketInfo.assignee}
Project: ${ticketInfo.projectKey}

Recent changes:
${changelog}

Please:
1. Review the changes to this ticket
2. Update your implementation plan if needed
3. Continue or adjust your work based on the updates

Ticket URL: ${ticketInfo.ticketUrl}
`;
    } else {
      return `
JIRA event received: ${webhookEvent}
Ticket: ${ticketInfo.ticketKey}
Summary: ${ticketInfo.summary}

Please review this ticket and take appropriate action.

Ticket URL: ${ticketInfo.ticketUrl}
`;
    }
  }

  private extractChangelog(webhookData: any): string {
    const changelog = webhookData.changelog || {};
    const items = changelog.items || [];
    
    if (items.length === 0) {
      return 'No specific changes detected';
    }

    return items.map((item: any) => 
      `- ${item.field}: ${item.fromString || 'None'} → ${item.toString || 'None'}`
    ).join('\n');
  }

  private generateRandomPassword(length: number = 16): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }

  // Manual webhook trigger for testing
  triggerManualWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, prompt } = req.body;
      
      if (!prompt) {
        res.status(400).json({
          success: false,
          error: 'Prompt is required',
          timestamp: new Date().toISOString()
        } as ApiResponse);
        return;
      }

      let targetProject;
      
      if (projectId) {
        targetProject = await this.projectService.getProject(projectId);
        if (!targetProject) {
          res.status(404).json({
            success: false,
            error: 'Project not found',
            timestamp: new Date().toISOString()
          } as ApiResponse);
          return;
        }
      } else {
        // Use first available project as fallback
        const projects = await this.projectService.listProjects(1, 1);
        targetProject = projects.projects[0];
        
        if (!targetProject) {
          res.status(404).json({
            success: false,
            error: 'No projects available',
            timestamp: new Date().toISOString()
          } as ApiResponse);
          return;
        }
      }

      // Send to Claude Code
      const agentApiUrl = targetProject.urls?.agentapi || 
        `http://${targetProject.shortName}-claude-dev-env-service.${targetProject.namespace}.svc.cluster.local:3284`;
      
      const response = await axios.post(`${agentApiUrl}/message`, {
        content: prompt,
        type: 'user'
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      res.json({
        success: true,
        data: {
          projectId: targetProject.id,
          projectName: targetProject.name,
          response: response.data
        },
        message: 'Prompt sent successfully',
        timestamp: new Date().toISOString()
      } as ApiResponse);

    } catch (error) {
      logError(error, { context: 'manual-webhook-trigger' });
      
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }
  };
}