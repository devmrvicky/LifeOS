import type { IDBPDatabase } from 'idb';
import type { StorageAdapter } from './StorageAdapter';
import { getDB } from '../db';

/**
 * Wraps one IndexedDB object store as a `StorageAdapter<T>`. The underlying
 * `idb` database keeps its full typed schema in `lib/db.ts` — this adapter
 * only needs the store name at the boundary, so repositories built on top
 * of it never see idb-specific types.
 */
export function createIndexedDBAdapter<T>(storeName: string): StorageAdapter<T> {
  async function db(): Promise<IDBPDatabase<any>> {
    return getDB() as unknown as Promise<IDBPDatabase<any>>;
  }

  return {
    async put(item: T) {
      const database = await db();
      await database.put(storeName, item as any);
    },
    async get(id: string) {
      const database = await db();
      return (await database.get(storeName, id)) as T | undefined;
    },
    async delete(id: string) {
      const database = await db();
      await database.delete(storeName, id);
    },
    async getAll() {
      const database = await db();
      return (await database.getAll(storeName)) as T[];
    },
    async getAllByIndex(indexName: string, value: string) {
      const database = await db();
      return (await database.getAllFromIndex(storeName, indexName, value)) as T[];
    },
    async clear() {
      const database = await db();
      await database.clear(storeName);
    },
  };
}
