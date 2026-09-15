const fs = require('fs');
let content = fs.readFileSync('src/core/tests/syncHardening.test.ts', 'utf8');

const lockTestOld = `
  describe('SYNC-03: Multi-Tab Lock', () => {
    it('Two tabs cannot perform sync concurrently using Web Locks', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      
      // Delay the first sync to simulate concurrent second call
      vi.spyOn(googleDriveService, 'listFiles').mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 100));
        return [];
      });
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue(null);
      vi.spyOn(googleDriveService, 'uploadJsonFile').mockResolvedValue({ id: 'file_1' } as any);

      const promise1 = syncEngine.performFullSync();
      const promise2 = syncEngine.performFullSync();

      const [res1, res2] = await Promise.all([promise1, promise2]);
      
      // One must succeed, one must be blocked by the lock
      expect([res1.success, res2.success]).toContain(true);
      expect([res1.success, res2.success]).toContain(false);
      
      const failedRes = !res1.success ? res1 : res2;
      expect(failedRes.message).toContain('قفل المزامنة الموزع نشط');
    });
  });
`;

const lockTestNew = `
  describe('SYNC-03: Multi-Tab Lock', () => {
    it('Two tabs cannot perform sync concurrently using Web Locks', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      
      // Delay the first sync to simulate concurrent second call
      vi.spyOn(googleDriveService, 'listFiles').mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 100));
        return [];
      });
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue(null);
      vi.spyOn(googleDriveService, 'uploadJsonFile').mockResolvedValue({ id: 'file_1' } as any);

      const engine1 = new SyncEngine();
      const engine2 = new SyncEngine();

      const promise1 = engine1.performFullSync();
      const promise2 = engine2.performFullSync();

      const [res1, res2] = await Promise.all([promise1, promise2]);
      
      // One must succeed, one must be blocked by the lock
      expect([res1.success, res2.success]).toContain(true);
      expect([res1.success, res2.success]).toContain(false);
      
      const failedRes = !res1.success ? res1 : res2;
      expect(failedRes.message).toContain('قفل المزامنة الموزع نشط');
    });
  });
`;

content = content.replace(lockTestOld.trim(), lockTestNew.trim());
fs.writeFileSync('src/core/tests/syncHardening.test.ts', content);
