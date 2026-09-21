/**
 * Shared Sync Context Registry
 * Tracks whether the execution thread is currently applying remote mutations via SyncEngine.
 * Enforces security invariant that prevents unauthorized `{ isRemote: true }` bypassing local checks.
 */
export class SyncContextRegistry {
  private static _depth: number = 0;

  public static beginSyncApply(): void {
    SyncContextRegistry._depth++;
  }

  public static endSyncApply(): void {
    SyncContextRegistry._depth = Math.max(0, SyncContextRegistry._depth - 1);
  }

  public static isInsideSyncApply(): boolean {
    return SyncContextRegistry._depth > 0;
  }
}
