import type { Capture } from '../types';
import type { StorageAdapter } from '../lib/storage/StorageAdapter';
import { createIndexedDBAdapter } from '../lib/storage/indexedDBAdapter';
import { STORE_NAMES } from '../lib/db';

export class CaptureRepository {
  private adapter: StorageAdapter<Capture>;
  constructor(adapter: StorageAdapter<Capture>) {
    this.adapter = adapter;
  }

  put(capture: Capture): Promise<void> {
    return this.adapter.put(capture);
  }

  get(id: string): Promise<Capture | undefined> {
    return this.adapter.get(id);
  }

  async allSortedByRecent(): Promise<Capture[]> {
    const all = await this.adapter.getAll();
    return [...all].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  clear(): Promise<void> {
    return this.adapter.clear();
  }
}

export const captureRepository = new CaptureRepository(createIndexedDBAdapter<Capture>(STORE_NAMES.captures));
