import type { Task } from '../types';
import type { StorageAdapter } from '../lib/storage/StorageAdapter';
import { createIndexedDBAdapter } from '../lib/storage/indexedDBAdapter';
import { STORE_NAMES } from '../lib/db';

export class TaskRepository {
  private adapter: StorageAdapter<Task>;
  constructor(adapter: StorageAdapter<Task>) {
    this.adapter = adapter;
  }

  put(task: Task): Promise<void> {
    return this.adapter.put(task);
  }

  get(id: string): Promise<Task | undefined> {
    return this.adapter.get(id);
  }

  delete(id: string): Promise<void> {
    return this.adapter.delete(id);
  }

  all(): Promise<Task[]> {
    return this.adapter.getAll();
  }

  byStatus(status: Task['status']): Promise<Task[]> {
    return this.adapter.getAllByIndex('by-status', status);
  }

  clear(): Promise<void> {
    return this.adapter.clear();
  }
}

export const taskRepository = new TaskRepository(createIndexedDBAdapter<Task>(STORE_NAMES.tasks));
