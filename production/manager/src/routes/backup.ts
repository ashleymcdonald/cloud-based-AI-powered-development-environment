import { Router, Request, Response } from 'express';
import { GitBackupService } from '@/services/gitBackupService';
import { StateService } from '@/services/stateService';
import { apiLogger } from '@/utils/logger';

const router = Router();
const gitBackupService = new GitBackupService();
const stateService = new StateService();

// Initialize backup service
gitBackupService.initializeBackupRepo().catch(error => {
  apiLogger.error('Failed to initialize backup repository', { error });
});

// Get backup status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await gitBackupService.getBackupStatus();
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    apiLogger.error('Failed to get backup status', { error });
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// List available backups
router.get('/list', async (req: Request, res: Response) => {
  try {
    const backups = await gitBackupService.listAvailableBackups();
    res.json({
      success: true,
      data: {
        backups,
        count: backups.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    apiLogger.error('Failed to list backups', { error });
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Create backup
router.post('/create', async (req: Request, res: Response) => {
  try {
    const timestamp = await gitBackupService.backupKubernetesState();
    res.json({
      success: true,
      data: {
        timestamp,
        message: 'Backup created successfully'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    apiLogger.error('Failed to create backup', { error });
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Export current Kubernetes state
router.get('/export', async (req: Request, res: Response) => {
  try {
    const kubernetesState = await stateService.exportKubernetesState();
    
    res.setHeader('Content-Type', 'application/x-yaml');
    res.setHeader('Content-Disposition', `attachment; filename="kubernetes-state-${new Date().toISOString().replace(/[:.]/g, '-')}.yaml"`);
    res.send(kubernetesState);
  } catch (error) {
    apiLogger.error('Failed to export Kubernetes state', { error });
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Restore from backup (placeholder - needs implementation)
router.post('/restore', async (req: Request, res: Response) => {
  try {
    const { timestamp } = req.body;
    
    // TODO: Implement restore functionality
    await gitBackupService.restoreFromBackup(timestamp);
    
    res.json({
      success: true,
      data: {
        message: 'Restore completed successfully',
        timestamp
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    apiLogger.error('Failed to restore from backup', { error });
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get cluster information
router.get('/cluster-info', async (req: Request, res: Response) => {
  try {
    const clusterInfo = await stateService.getClusterInfo();
    res.json({
      success: true,
      data: clusterInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    apiLogger.error('Failed to get cluster info', { error });
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;