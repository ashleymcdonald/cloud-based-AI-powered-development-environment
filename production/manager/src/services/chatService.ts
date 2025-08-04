import { ChatMessage, ProjectConfig } from '@/types/project';
import { Logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

export class ChatService {
  private messages: Map<string, ChatMessage[]> = new Map();
  private logger = Logger.getInstance();

  constructor() {
    this.loadMessages();
  }

  async sendMessage(projectId: string, content: string, userId?: string): Promise<ChatMessage> {
    // Create user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      projectId,
      type: 'user',
      content,
      timestamp: new Date(),
      status: 'pending'
    };

    // Store user message
    this.addMessage(userMessage);

    try {
      // Send to Claude Code instance
      const response = await this.sendToClaudeCode(projectId, content);
      
      // Update user message status
      userMessage.status = 'sent';
      this.updateMessage(userMessage);

      // Create Claude response message
      const claudeMessage: ChatMessage = {
        id: uuidv4(),
        projectId,
        type: 'claude',
        content: response.content || 'Claude Code received your message but did not provide a response.',
        timestamp: new Date(),
        status: 'delivered'
      };

      this.addMessage(claudeMessage);

      return userMessage;

    } catch (error) {
      this.logger.error(`Failed to send message to project ${projectId}:`, error);
      
      // Update user message status
      userMessage.status = 'error';
      this.updateMessage(userMessage);

      // Create error message
      const errorMessage: ChatMessage = {
        id: uuidv4(),
        projectId,
        type: 'system',
        content: `Failed to send message to Claude Code: ${error.message}`,
        timestamp: new Date(),
        status: 'delivered'
      };

      this.addMessage(errorMessage);

      throw error;
    }
  }

  async sendToClaudeCode(projectId: string, content: string): Promise<{ content: string; metadata?: any }> {
    // This would typically get the project configuration to determine the AgentAPI URL
    // For now, we'll use a placeholder implementation
    
    const agentApiUrl = this.getAgentApiUrl(projectId);
    
    const response = await axios.post(`${agentApiUrl}/message`, {
      content,
      type: 'user'
    }, {
      timeout: 60000, // 60 second timeout for Claude responses
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Parse response from AgentAPI
    if (response.status === 200) {
      return {
        content: response.data.response || response.data.message || 'Message received by Claude Code',
        metadata: response.data
      };
    } else {
      throw new Error(`AgentAPI returned status ${response.status}`);
    }
  }

  getMessages(projectId: string, limit: number = 50): ChatMessage[] {
    const projectMessages = this.messages.get(projectId) || [];
    
    // Return most recent messages
    return projectMessages
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .reverse(); // Oldest first for display
  }

  addMessage(message: ChatMessage): void {
    const projectMessages = this.messages.get(message.projectId) || [];
    projectMessages.push(message);
    
    // Keep only last 100 messages per project
    if (projectMessages.length > 100) {
      projectMessages.splice(0, projectMessages.length - 100);
    }
    
    this.messages.set(message.projectId, projectMessages);
    this.saveMessages();
  }

  updateMessage(message: ChatMessage): void {
    const projectMessages = this.messages.get(message.projectId) || [];
    const index = projectMessages.findIndex(m => m.id === message.id);
    
    if (index !== -1) {
      projectMessages[index] = message;
      this.messages.set(message.projectId, projectMessages);
      this.saveMessages();
    }
  }

  deleteProjectMessages(projectId: string): void {
    this.messages.delete(projectId);
    this.saveMessages();
  }

  // Get chat statistics
  getChatStats(): {
    totalMessages: number;
    messagesByProject: Record<string, number>;
    recentActivity: { projectId: string; lastMessage: Date }[];
  } {
    let totalMessages = 0;
    const messagesByProject: Record<string, number> = {};
    const recentActivity: { projectId: string; lastMessage: Date }[] = [];

    for (const [projectId, messages] of this.messages.entries()) {
      const messageCount = messages.length;
      totalMessages += messageCount;
      messagesByProject[projectId] = messageCount;

      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        recentActivity.push({
          projectId,
          lastMessage: lastMessage.timestamp
        });
      }
    }

    // Sort by most recent activity
    recentActivity.sort((a, b) => b.lastMessage.getTime() - a.lastMessage.getTime());

    return {
      totalMessages,
      messagesByProject,
      recentActivity: recentActivity.slice(0, 10) // Top 10 most active
    };
  }

  private getAgentApiUrl(projectId: string): string {
    // In a real implementation, this would lookup the project configuration
    // and return the actual AgentAPI URL for the project
    
    // For now, we'll construct a default URL
    // This should be replaced with actual project lookup
    return `http://project-${projectId}-claude-dev-env-service.claude-dev-${projectId}.svc.cluster.local:3284`;
  }

  // Persistence (simplified - in production use a proper database)
  private async loadMessages(): Promise<void> {
    // TODO: Load from database
    this.logger.info('Loaded chat messages from storage');
  }

  private async saveMessages(): Promise<void> {
    // TODO: Save to database
    // For now, we'll just log that we're saving
    // In production, this would persist to a database
  }

  // Utility methods for message formatting
  formatMessageForDisplay(message: ChatMessage): {
    id: string;
    type: string;
    content: string;
    timestamp: string;
    status?: string;
  } {
    return {
      id: message.id,
      type: message.type,
      content: message.content,
      timestamp: message.timestamp.toISOString(),
      status: message.status
    };
  }

  // Search messages
  searchMessages(projectId: string, query: string, limit: number = 20): ChatMessage[] {
    const projectMessages = this.messages.get(projectId) || [];
    
    const searchTerms = query.toLowerCase().split(' ');
    
    return projectMessages
      .filter(message => {
        const content = message.content.toLowerCase();
        return searchTerms.every(term => content.includes(term));
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Export messages for a project
  exportMessages(projectId: string): {
    projectId: string;
    exportDate: Date;
    messageCount: number;
    messages: ChatMessage[];
  } {
    const messages = this.messages.get(projectId) || [];
    
    return {
      projectId,
      exportDate: new Date(),
      messageCount: messages.length,
      messages: messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    };
  }
}