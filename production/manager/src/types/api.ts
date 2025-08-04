import { Request } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: 'admin' | 'user';
  };
}

export interface KubernetesError {
  message: string;
  code?: number;
  details?: any;
}

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  projectId?: string;
  component: string;
  metadata?: Record<string, any>;
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: {
    kubernetes: boolean;
    database: boolean;
    projects: {
      total: number;
      healthy: number;
      unhealthy: number;
    };
  };
  timestamp: Date;
}

export interface SystemMetrics {
  projects: {
    total: number;
    running: number;
    stopped: number;
    error: number;
  };
  resources: {
    totalCpuRequests: string;
    totalMemoryRequests: string;
    totalCpuLimits: string;
    totalMemoryLimits: string;
  };
  events: {
    last24h: number;
    webhooks: number;
    chatMessages: number;
  };
}