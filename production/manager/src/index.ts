import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import rateLimit from 'express-rate-limit';
import path from 'path';

import logger, { apiLogger, chatLogger, logRequest } from '@/utils/logger';
import { ProjectController } from '@/controllers/projectController';
import { httpRequestDuration, httpRequestTotal, activeChatConnections } from '@/utils/metrics';
import monitoringRouter from '@/routes/monitoring';
import backupRouter from '@/routes/backup';
import { register } from '@/utils/metrics';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"]
  }
});

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  const end = httpRequestDuration.startTimer({
    method: req.method,
    route: req.route?.path || req.path,
  });
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    end({ status_code: res.statusCode.toString() });
    
    httpRequestTotal.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode.toString()
    });
    
    logRequest(req, res, Date.now() - start);
  });
  
  next();
});
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true
}));

// Remove morgan since we're using custom request logging
// app.use(morgan('combined', {
//   stream: { write: (message) => logger.info(message.trim()) }
// }));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests',
    timestamp: new Date().toISOString()
  }
});

app.use('/api', limiter);

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Controllers
const projectController = new ProjectController();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

// API Routes
const apiRouter = express.Router();

// Project routes
apiRouter.post('/projects', ProjectController.createValidation, projectController.createProject);
apiRouter.get('/projects', ProjectController.listValidation, projectController.listProjects);
apiRouter.get('/projects/:id', projectController.getProject);
apiRouter.put('/projects/:id', ProjectController.updateValidation, projectController.updateProject);
apiRouter.delete('/projects/:id', projectController.deleteProject);
apiRouter.post('/projects/:id/refresh', projectController.refreshProjectStatus);
apiRouter.get('/projects/:id/logs', projectController.getProjectLogs);

// Git credentials routes
apiRouter.post('/git-credentials', projectController.createGitCredential);
apiRouter.get('/git-credentials', projectController.listGitCredentials);
apiRouter.delete('/git-credentials/:id', projectController.deleteGitCredential);

// System routes
apiRouter.get('/system/status', async (req, res) => {
  try {
    // TODO: Implement system status check
    res.json({
      success: true,
      data: {
        kubernetes: true,
        database: true,
        projects: {
          total: 0,
          healthy: 0,
          unhealthy: 0
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.use('/api', apiRouter);
app.use('/api/monitoring', monitoringRouter);
app.use('/api/backup', backupRouter);

// Serve frontend for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  } else {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found',
      timestamp: new Date().toISOString()
    });
  }
});

// WebSocket handling for real-time features
let activeConnections = 0;

io.on('connection', (socket) => {
  activeConnections++;
  activeChatConnections.set(activeConnections);
  chatLogger.info(`Client connected: ${socket.id}`, { activeConnections });

  socket.on('join-project', (projectId: string) => {
    socket.join(`project-${projectId}`);
    chatLogger.info(`Client ${socket.id} joined project ${projectId}`, { projectId });
  });

  socket.on('leave-project', (projectId: string) => {
    socket.leave(`project-${projectId}`);
    chatLogger.info(`Client ${socket.id} left project ${projectId}`, { projectId });
  });

  socket.on('send-message', async (data: { projectId: string; message: string }) => {
    try {
      // TODO: Implement chat message handling
      const response = {
        id: Date.now().toString(),
        projectId: data.projectId,
        type: 'user',
        content: data.message,
        timestamp: new Date()
      };

      // Broadcast to all clients in the project room
      io.to(`project-${data.projectId}`).emit('message', response);

      // TODO: Send to Claude Code instance and get response
      
    } catch (error) {
      chatLogger.error('Failed to handle chat message', { error: error.message, projectId: data.projectId });
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('disconnect', () => {
    activeConnections--;
    activeChatConnections.set(activeConnections);
    chatLogger.info(`Client disconnected: ${socket.id}`, { activeConnections });
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  apiLogger.error('Unhandled error', { 
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
server.listen(PORT, () => {
  logger.info(`Claude Code Manager started on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Frontend URL: ${process.env.FRONTEND_URL || 'Not configured'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

export { app, server, io };