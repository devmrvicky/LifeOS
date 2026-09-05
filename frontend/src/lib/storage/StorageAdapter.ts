/**
 * A generic storage adapter for a single collection. Repositories depend on
 * this interface, never on IndexedDB directly, so a future
 * `SupabaseStorageAdapter` (or any other backend) can be swapped in without
 * touching a single repository, store, or UI component.
 */
export interface StorageAdapter<T> {
  put(item: T): Promise<void>;
  get(id: string): Promise<T | undefined>;
  delete(id: string): Promise<void>;
  getAll(): Promise<T[]>;
  getAllByIndex(indexName: string, value: string): Promise<T[]>;
  clear(): Promise<void>;
}
