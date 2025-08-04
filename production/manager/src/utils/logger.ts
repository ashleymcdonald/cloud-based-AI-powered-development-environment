import winston from 'winston';
import path from 'path';

const logDir = 'logs';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]`;
    if (service) log += ` [${service}]`;
    log += `: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, service }) => {
    let log = `${timestamp} ${level}`;
    if (service) log += ` [${service}]`;
    return `${log}: ${message}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'claude-manager' },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
    
    // Separate files for different services
    new winston.transports.File({
      filename: path.join(logDir, 'project-operations.log'),
      level: 'info',
      format: winston.format.combine(
        winston.format.label({ label: 'PROJECT' }),
        logFormat
      ),
    }),
    
    new winston.transports.File({
      filename: path.join(logDir, 'webhooks.log'),
      level: 'info',
      format: winston.format.combine(
        winston.format.label({ label: 'WEBHOOK' }),
        logFormat
      ),
    }),
  ],
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Create child loggers for different services
export const projectLogger = logger.child({ service: 'project-service' });
export const webhookLogger = logger.child({ service: 'webhook-service' });
export const kubernetesLogger = logger.child({ service: 'kubernetes-service' });
export const chatLogger = logger.child({ service: 'chat-service' });
export const apiLogger = logger.child({ service: 'api' });

export default logger;

// Helper function for request logging
export const logRequest = (req: any, res: any, responseTime?: number) => {
  const logData = {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    statusCode: res.statusCode,
    responseTime: responseTime ? `${responseTime}ms` : undefined,
  };
  
  if (res.statusCode >= 400) {
    apiLogger.warn('HTTP Request', logData);
  } else {
    apiLogger.info('HTTP Request', logData);
  }
};

// Helper function for error logging
export const logError = (error: Error, context?: any) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    context,
  });
};

// Helper function for project operations
export const logProjectOperation = (operation: string, projectId: string, details?: any) => {
  projectLogger.info(`Project ${operation}`, {
    projectId,
    operation,
    ...details,
  });
};

// Helper function for webhook events
export const logWebhookEvent = (source: string, event: string, details?: any) => {
  webhookLogger.info(`Webhook ${event}`, {
    source,
    event,
    ...details,
  });
};