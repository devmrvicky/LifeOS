import type { ReminderEvent } from '../types';
import type { StorageAdapter } from '../lib/storage/StorageAdapter';
import { createIndexedDBAdapter } from '../lib/storage/indexedDBAdapter';
import { STORE_NAMES } from '../lib/db';

export class ReminderRepository {
  private adapter: StorageAdapter<ReminderEvent>;
  constructor(adapter: StorageAdapter<ReminderEvent>) {
    this.adapter = adapter;
  }

  put(event: ReminderEvent): Promise<void> {
    return this.adapter.put(event);
  }

  forTask(taskId: string): Promise<ReminderEvent[]> {
    return this.adapter.getAllByIndex('by-task', taskId);
  }

  clear(): Promise<void> {
    return this.adapter.clear();
  }
}

export const reminderRepository = new ReminderRepository(
  createIndexedDBAdapter<ReminderEvent>(STORE_NAMES.reminderEvents)
);
