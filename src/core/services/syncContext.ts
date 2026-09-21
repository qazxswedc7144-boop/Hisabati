/**
 * Shared Sync Context Registry
 * Tracks whether the execution thread is currently applying remote mutations via SyncEngine.
 * Enforces security invariant that prevents unauthorized `{ isRemote: true }` bypassing local checks.
 */
export class SyncContextRegistry {
  private static _isInsideSyncApply: boolean = false;

  public static beginSyncApply(): void {
    SyncContextRegistry._isInsideSyncApply = true;
  }

  public static endSyncApply(): void {
    SyncContextRegistry._isInsideSyncApply = false;
  }

  public static isInsideSyncApply(): boolean {
    return SyncContextRegistry._isInsideSyncApply;
  }
}
