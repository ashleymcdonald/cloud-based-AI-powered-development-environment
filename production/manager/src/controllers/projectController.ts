import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { ProjectService } from '@/services/projectService';
import { ApiResponse } from '@/types/api';
import { ProjectCreateRequest, ProjectUpdateRequest } from '@/types/project';
import { Logger } from '@/utils/logger';

export class ProjectController {
  private projectService: ProjectService;
  private logger = Logger.getInstance();

  constructor() {
    this.projectService = new ProjectService();
  }

  // Validation rules
  static createValidation = [
    body('name').notEmpty().withMessage('Project name is required'),
    body('gitRepository').isURL().withMessage('Valid git repository URL is required'),
    body('anthropicApiKey').notEmpty().withMessage('Anthropic API key is required'),
    body('codeServerPassword').isLength({ min: 8 }).withMessage('Code server password must be at least 8 characters'),
    body('sudoPassword').isLength({ min: 8 }).withMessage('Sudo password must be at least 8 characters'),
    body('shortName').optional().isLength({ min: 1, max: 20 }).withMessage('Short name must be 1-20 characters'),
    body('jiraProjectKeys').optional().isArray().withMessage('JIRA project keys must be an array')
  ];

  static updateValidation = [
    param('id').isUUID().withMessage('Valid project ID is required'),
    body('name').optional().notEmpty().withMessage('Project name cannot be empty'),
    body('anthropicApiKey').optional().notEmpty().withMessage('Anthropic API key cannot be empty'),
    body('codeServerPassword').optional().isLength({ min: 8 }).withMessage('Code server password must be at least 8 characters'),
    body('sudoPassword').optional().isLength({ min: 8 }).withMessage('Sudo password must be at least 8 characters')
  ];

  static listValidation = [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('sortBy').optional().isIn(['name', 'createdAt', 'updatedAt', 'status']).withMessage('Invalid sort field')
  ];

  createProject = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          message: errors.array().map(err => err.msg).join(', '),
          timestamp: new Date().toISOString()
        } as ApiResponse);
        return;
      }

      const request: ProjectCreateRequest = req.body;
      const project = await this.projectService.createProject(request);

      this.logger.info(`Project created: ${project.name} (${project.id})`);

      res.status(201).json({
        success: true,
        data: project,
        message: 'Project created successfully',
        timestamp: new Date().toISOString()
      } as ApiResponse);

    } catch (error) {
      this.logger.error('Failed to create project:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }
  };

  getProject = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Project ID is required',
          timestamp: new Date().toISOString()
        } as ApiResponse);
        return;
      }

      const project = await this.projectService.getProject(id);
      
      if (!project) {
        res.status(404).json({
          success: false,
          error: 'Project not found',
          timestamp: new Date().toISOString()
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: project,
        timestamp: new Date().toISOString()
      } as ApiResponse);

    } catch (error) {
      this.logger.error('Failed to get project:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }
  };

  listProjects = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          message: errors.array().map(err => err.msg).join(', '),
          timestamp: new Date().toISOString()
        } as ApiResponse);
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const sortBy = req.query.sortBy as string || 'createdAt';

      const result = await this.projectService.listProjects(page, limit, sortBy);

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      } as ApiResponse);

    } catch (error) {
      this.logger.error('Failed to list projects:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }
  };

  updateProject = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          message: errors.array().map(err => err.msg).join(', '),
          timestamp: new Date().toISOString()
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const request: ProjectUpdateRequest = req.body;

      const project = await this.projectService.updateProject(id, request);

      this.logger.info(`Project updated: ${project.name} (${project.id})`);

      res.json({
        success: true,
        data: project,
        message: 'Project updated successfully',
        timestamp: new Date().toISOString()
      } as ApiResponse);

    } catch (error) {
      this.logger.error('Failed to update project:', error);
      
      const statusCode = error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }
  };

  deleteProject = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Project ID is required',
          timestamp: new Date().toISOString()
        } as ApiResponse);
        return;
      }

      await this.projectService.deleteProject(id);

      this.logger.info(`Project deleted: ${id}`);

      res.json({
        success: true,
        message: 'Project deleted successfully',
        timestamp: new Date().toISOString()
      } as ApiResponse);

    } catch (error) {
      this.logger.error('Failed to delete project:', error);
      
      const statusCode = error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }
  };

  refreshProjectStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Project ID is required',
          timestamp: new Date().toISOString()
        } as ApiResponse);
        return;
      }

      const project = await this.projectService.refreshProjectStatus(id);

      res.json({
        success: true,
        data: project,
        message: 'Project status refreshed',
        timestamp: new Date().toISOString()
      } as ApiResponse);

    } catch (error) {
      this.logger.error('Failed to refresh project status:', error);
      
      const statusCode = error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }
  };

  getProjectLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const lines = parseInt(req.query.lines as string) || 100;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Project ID is required',
          timestamp: new Date().toISOString()
        } as ApiResponse);
        return;
      }

      const logs = await this.projectService.getProjectLogs(id, lines);

      res.json({
        success: true,
        data: { logs },
        timestamp: new Date().toISOString()
      } as ApiResponse);

    } catch (error) {
      this.logger.error('Failed to get project logs:', error);
      
      const statusCode = error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }
  };

  // Git Credentials endpoints
  createGitCredential = async (req: Request, res: Response): Promise<void> => {
    try {
      const credential = await this.projectService.createGitCredential(req.body);

      // Don't return sensitive data
      const safeCredential = {
        ...credential,
        token: credential.token ? '***' : undefined,
        sshPrivateKey: credential.sshPrivateKey ? '***' : undefined
      };

      res.status(201).json({
        success: true,
        data: safeCredential,
        message: 'Git credential created successfully',
        timestamp: new Date().toISOString()
      } as ApiResponse);

    } catch (error) {
      this.logger.error('Failed to create git credential:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }
  };

  listGitCredentials = async (req: Request, res: Response): Promise<void> => {
    try {
      const credentials = await this.projectService.listGitCredentials();

      // Don't return sensitive data
      const safeCredentials = credentials.map(cred => ({
        ...cred,
        token: cred.token ? '***' : undefined,
        sshPrivateKey: cred.sshPrivateKey ? '***' : undefined
      }));

      res.json({
        success: true,
        data: safeCredentials,
        timestamp: new Date().toISOString()
      } as ApiResponse);

    } catch (error) {
      this.logger.error('Failed to list git credentials:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }
  };

  deleteGitCredential = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Credential ID is required',
          timestamp: new Date().toISOString()
        } as ApiResponse);
        return;
      }

      await this.projectService.deleteGitCredential(id);

      res.json({
        success: true,
        message: 'Git credential deleted successfully',
        timestamp: new Date().toISOString()
      } as ApiResponse);

    } catch (error) {
      this.logger.error('Failed to delete git credential:', error);
      
      const statusCode = error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }
  };
}