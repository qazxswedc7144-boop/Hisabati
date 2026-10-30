import { db } from '../database/db';
import { StructuredAICommand } from '@/shared/types/ai.types';

const SETTING_KEY = 'pending_ai_commands';

export class AICommandRepository {
  private async getStoredMap(): Promise<Map<string, StructuredAICommand>> {
    const entry = await db.settings.get(SETTING_KEY);
    if (!entry || typeof entry.value !== 'string') {
      return new Map();
    }
    try {
      const data = JSON.parse(entry.value);
      return new Map(Object.entries(data));
    } catch {
      return new Map();
    }
  }

  private async saveMap(map: Map<string, StructuredAICommand>): Promise<void> {
    const data = Object.fromEntries(map.entries());
    await db.settings.put({
      id: SETTING_KEY,
      key: SETTING_KEY,
      value: JSON.stringify(data),
      updatedAt: new Date().toISOString(),
    });
  }

  public async add(command: StructuredAICommand): Promise<void> {
    const map = await this.getStoredMap();
    map.set(command.id, command);
    await this.saveMap(map);
  }

  public async update(command: StructuredAICommand): Promise<void> {
    const map = await this.getStoredMap();
    map.set(command.id, command);
    await this.saveMap(map);
  }

  public async delete(id: string): Promise<void> {
    const map = await this.getStoredMap();
    map.delete(id);
    await this.saveMap(map);
  }

  public async getById(id: string): Promise<StructuredAICommand | undefined> {
    const map = await this.getStoredMap();
    return map.get(id);
  }

  public async getAllPending(): Promise<StructuredAICommand[]> {
    const map = await this.getStoredMap();
    return Array.from(map.values()).filter(cmd => 
      ['PENDING_VALIDATION', 'READY_FOR_CONFIRMATION', 'CONFIRMED'].includes(cmd.status)
    );
  }

  public async clearExecutedAndCancelled(): Promise<void> {
    const map = await this.getStoredMap();
    for (const [id, cmd] of map.entries()) {
      if (['EXECUTED', 'CANCELLED', 'REJECTED'].includes(cmd.status)) {
        map.delete(id);
      }
    }
    await this.saveMap(map);
  }
}

export const aiCommandRepository = new AICommandRepository();
