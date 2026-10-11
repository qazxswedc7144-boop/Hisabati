/**
 * Side-effectful initialization for sync subscriptions.
 *
 * Extracted from syncStore.ts so that store modules remain tree-shakeable.
 * This module is imported lazily from App.tsx during app bootstrap.
 */

import { useSyncStore } from './syncStore';

/**
 * Wires syncEngine status/conflict subscriptions into the syncStore.
 * Should be called exactly once during application initialization.
 */
export function bootstrapSyncSubscriptions(): void {
  if (typeof window === 'undefined' || (import.meta as any).env?.TEST) {
    return;
  }

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

      useSyncStore.getState().checkDriveConnection();
    } catch {
      /* ignore */
    }
  }, 2000);
}
