/**
 * Zustand Store for Cloud Sync and Google Drive Backup Management.
 */

import { create } from 'zustand';
import {
  SyncStatusType,
  SyncConflictItem,
  DriveFileInfo,
} from '@/shared/types';

interface SyncStoreState {
  isDriveConnected: boolean;
  userEmail: string | null;
  userName: string | null;
  syncStatus: SyncStatusType;
  lastSyncTime: string | null;
  pendingQueueCount: number;
  queueStats: {
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    total: number;
  };
  conflicts: SyncConflictItem[];
  cloudBackups: DriveFileInfo[];
  isLoadingBackups: boolean;
  autoSyncEnabled: boolean;
  isRestoring: boolean;
  isBackingUp: boolean;

  // Actions
  checkDriveConnection: () => void;
  connectGoogleDrive: () => Promise<boolean>;
  disconnectGoogleDrive: () => void;
  triggerManualSync: () => Promise<void>;
  triggerManualBackup: () => Promise<void>;
  restoreFromDriveFile: (fileId: string, mode?: 'replace' | 'merge') => Promise<void>;
  fetchCloudBackups: () => Promise<void>;
  deleteCloudBackup: (fileId: string) => Promise<void>;
  resolveConflict: (conflict: SyncConflictItem, choice: 'local' | 'remote') => Promise<void>;
  updatePendingCount: () => Promise<void>;
  retryFailedQueue: () => Promise<number>;
  clearCompletedQueue: () => Promise<number>;
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  isDriveConnected: false, // Will be updated in checkDriveConnection
  userEmail: null,
  userName: null,
  syncStatus: 'idle',
  lastSyncTime: typeof localStorage !== 'undefined' ? localStorage.getItem('hisabati_last_sync_time') : null,
  pendingQueueCount: 0,
  queueStats: { pending: 0, processing: 0, failed: 0, completed: 0, total: 0 },
  conflicts: [],
  cloudBackups: [],
  isLoadingBackups: false,
  autoSyncEnabled: true,
  isRestoring: false,
  isBackingUp: false,

  checkDriveConnection: async () => {
    const { googleDriveService } = await import('@/core/services/googleDrive.service');
    const connected = googleDriveService.isConnected();
    const user = googleDriveService.getUserInfo();
    set({
      isDriveConnected: connected,
      userEmail: user?.email || null,
      userName: user?.name || null,
    });
    get().updatePendingCount();
  },

  connectGoogleDrive: async () => {
    const { googleDriveService } = await import('@/core/services/googleDrive.service');
    const success = await googleDriveService.requestGoogleAuth();
    get().checkDriveConnection();
    if (success) {
      get().fetchCloudBackups();
      get().triggerManualSync();
    }
    return success;
  },

  disconnectGoogleDrive: async () => {
    const { googleDriveService } = await import('@/core/services/googleDrive.service');
    googleDriveService.disconnect();
    set({
      isDriveConnected: false,
      userEmail: null,
      userName: null,
      cloudBackups: [],
    });
  },

  updatePendingCount: async () => {
    try {
      const { syncEngine } = await import('@/core/services/syncEngine.service');
      const [count, stats] = await Promise.all([
        syncEngine.getPendingCount(),
        syncEngine.getQueueStats(),
      ]);
      set({ pendingQueueCount: count, queueStats: stats });
    } catch {
      // ignore
    }
  },

  retryFailedQueue: async () => {
    try {
      const { syncEngine } = await import('@/core/services/syncEngine.service');
      const retriedCount = await syncEngine.retryFailedQueueItems();
      await get().updatePendingCount();
      return retriedCount;
    } catch (err) {
      console.warn('Retry failed queue items failed:', err);
      return 0;
    }
  },

  clearCompletedQueue: async () => {
    try {
      const { syncEngine } = await import('@/core/services/syncEngine.service');
      const clearedCount = await syncEngine.clearCompletedQueue();
      await get().updatePendingCount();
      return clearedCount;
    } catch (err) {
      console.warn('Clear completed queue items failed:', err);
      return 0;
    }
  },

  triggerManualSync: async () => {
    try {
      const { syncEngine } = await import('@/core/services/syncEngine.service');
      const res = await syncEngine.performFullSync();
      set({
        lastSyncTime: new Date().toISOString(),
        conflicts: res.conflicts || [],
      });
      await get().updatePendingCount();
    } catch (err) {
      console.warn('Manual sync failed:', err);
      throw err;
    }
  },

  triggerManualBackup: async () => {
    set({ isBackingUp: true });
    try {
      const { backupService } = await import('@/core/services/backup.service');
      await backupService.uploadBackupToGoogleDrive();
      await get().fetchCloudBackups();
    } finally {
      set({ isBackingUp: false });
    }
  },

  fetchCloudBackups: async () => {
    const { googleDriveService } = await import('@/core/services/googleDrive.service');
    if (!googleDriveService.isConnected()) return;
    set({ isLoadingBackups: true });
    try {
      const files = await googleDriveService.listFiles();
      // Filter backup files
      const backups = files.filter((f) => f.name.startsWith('hisabati-backup'));
      set({ cloudBackups: backups });
    } catch (err) {
      console.warn('Failed to fetch cloud backups:', err);
    } finally {
      set({ isLoadingBackups: false });
    }
  },

  deleteCloudBackup: async (fileId: string) => {
    try {
      const { googleDriveService } = await import('@/core/services/googleDrive.service');
      await googleDriveService.deleteFile(fileId);
      await get().fetchCloudBackups();
    } catch (err) {
      console.warn('Failed to delete cloud backup:', err);
      throw err;
    }
  },

  restoreFromDriveFile: async (fileId: string, mode = 'replace') => {
    set({ isRestoring: true });
    try {
      const { backupService } = await import('@/core/services/backup.service');
      await backupService.restoreBackupFromGoogleDrive(fileId, (mode as any));
    } finally {
      set({ isRestoring: false });
    }
  },

  resolveConflict: async (conflict: SyncConflictItem, choice: 'local' | 'remote') => {
    const { syncEngine } = await import('@/core/services/syncEngine.service');
    await syncEngine.resolveConflict(conflict, choice);
    set((state) => ({
      conflicts: state.conflicts.filter((c) => c.id !== conflict.id),
    }));
  },
}));

// Delayed subscription to syncEngine to keep index clean
setTimeout(async () => {
  try {
    const { syncEngine } = await import('@/core/services/syncEngine.service');
    syncEngine.subscribeStatus((status) => {
      useSyncStore.setState({ syncStatus: status });
      const updatePending = useSyncStore.getState().updatePendingCount;
      if (typeof updatePending === 'function') {
        updatePending();
      }
    });

    syncEngine.subscribeConflicts((conflicts) => {
      useSyncStore.setState({ conflicts });
    });

    // Initial check
    useSyncStore.getState().checkDriveConnection();
  } catch { /* ignore */ }
}, 2000);
