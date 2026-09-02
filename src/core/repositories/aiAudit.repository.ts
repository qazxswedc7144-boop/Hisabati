import { db } from '../database/db';
import { AIAuditLogEntry } from '@/shared/types';

export class AIAuditRepository {
  async addLog(entry: AIAuditLogEntry): Promise<void> {
    try {
      await db.aiAuditLogs.put(entry);
    } catch (err) {
      console.warn('Could not write AI audit log:', err);
    }
  }

  async getAllLogs(limit = 50): Promise<AIAuditLogEntry[]> {
    try {
      return await db.aiAuditLogs.orderBy('timestamp').reverse().limit(limit).toArray();
    } catch {
      return [];
    }
  }

  async getLogsByRequestId(requestId: string): Promise<AIAuditLogEntry[]> {
    try {
      return await db.aiAuditLogs.where('requestId').equals(requestId).toArray();
    } catch {
      return [];
    }
  }

  async updateLogStatus(id: string, status: AIAuditLogEntry['status'], confirmed?: boolean): Promise<void> {
    try {
      const existing = await db.aiAuditLogs.get(id);
      if (existing) {
        existing.status = status;
        if (confirmed !== undefined) {
          existing.confirmed = confirmed;
        }
        await db.aiAuditLogs.put(existing);
      }
    } catch (err) {
      console.warn('Could not update AI audit log:', err);
    }
  }
}

export const aiAuditRepository = new AIAuditRepository();
