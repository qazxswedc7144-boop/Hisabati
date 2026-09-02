/**
 * Zustand Store for Cloud Sync and Google Drive Backup Management.
 */

import { create } from 'zustand';
import {
  SyncStatusType,
  SyncConflictItem,
  DriveFileInfo,
} from '@/shared/types';
import { googleDriveService } from '@/core/services/googleDrive.service';
import { syncEngine } from '@/core/services/syncEngine.service';
import { backupService } from '@/core/services/backup.service';

interface SyncStoreState {
  isDriveConnected: boolean;
  userEmail: string | null;
  userName: string | null;
  syncStatus: SyncStatusType;
  lastSyncTime: string | null;
  pendingQueueCount: number;
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
}

export const useSyncStore = create<SyncStoreState>((set, get) => {
  // Subscribe to syncEngine events
  syncEngine.subscribeStatus((status) => {
    set({ syncStatus: status });
    get().updatePendingCount();
  });

  syncEngine.subscribeConflicts((conflicts) => {
    set({ conflicts });
  });

  return {
    isDriveConnected: googleDriveService.isConnected(),
    userEmail: googleDriveService.getUserInfo()?.email || null,
    userName: googleDriveService.getUserInfo()?.name || null,
    syncStatus: 'idle',
    lastSyncTime: localStorage.getItem('hisabati_last_sync_time'),
    pendingQueueCount: 0,
    conflicts: [],
    cloudBackups: [],
    isLoadingBackups: false,
    autoSyncEnabled: true,
    isRestoring: false,
    isBackingUp: false,

    checkDriveConnection: () => {
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
      const success = await googleDriveService.requestGoogleAuth();
      get().checkDriveConnection();
      if (success) {
        get().fetchCloudBackups();
        get().triggerManualSync();
      }
      return success;
    },

    disconnectGoogleDrive: () => {
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
        const count = await syncEngine.getPendingCount();
        set({ pendingQueueCount: count });
      } catch {
        // ignore
      }
    },

    triggerManualSync: async () => {
      try {
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
        await backupService.uploadBackupToGoogleDrive();
        await get().fetchCloudBackups();
      } finally {
        set({ isBackingUp: false });
      }
    },

    fetchCloudBackups: async () => {
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
        await backupService.restoreBackupFromGoogleDrive(fileId, mode);
      } finally {
        set({ isRestoring: false });
      }
    },

    resolveConflict: async (conflict: SyncConflictItem, choice: 'local' | 'remote') => {
      await syncEngine.resolveConflict(conflict, choice);
      set((state) => ({
        conflicts: state.conflicts.filter((c) => c.id !== conflict.id),
      }));
    },
  };
});
