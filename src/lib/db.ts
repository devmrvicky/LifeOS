import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Capture, ReminderEvent, Task } from '../types';

// ---------------------------------------------------------------------------
// Local-first storage. This mirrors the `captures` / `tasks` /
// `reminder_events` tables in supabase/schema.sql field-for-field, so a
// future sync layer is a straight upsert in both directions rather than a
// remodel. See README "Local-first + sync" for how a signed-in user's data
// would reconcile with Supabase.
// ---------------------------------------------------------------------------

interface LifeOSDB extends DBSchema {
  captures: {
    key: string;
    value: Capture;
    indexes: { 'by-created': string };
  };
  tasks: {
    key: string;
    value: Task;
    indexes: { 'by-status': string; 'by-due': string };
  };
  reminder_events: {
    key: string;
    value: ReminderEvent;
    indexes: { 'by-task': string };
  };
}

const DB_NAME = 'lifeos';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<LifeOSDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<LifeOSDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LifeOSDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const captures = db.createObjectStore('captures', { keyPath: 'id' });
        captures.createIndex('by-created', 'created_at');

        const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
        tasks.createIndex('by-status', 'status');
        tasks.createIndex('by-due', 'due_date');

        const events = db.createObjectStore('reminder_events', { keyPath: 'id' });
        events.createIndex('by-task', 'task_id');
      },
    });
  }
  return dbPromise;
}

export const captureRepo = {
  async put(capture: Capture) {
    const db = await getDB();
    await db.put('captures', capture);
  },
  async all(): Promise<Capture[]> {
    const db = await getDB();
    const items = await db.getAllFromIndex('captures', 'by-created');
    return items.reverse();
  },
};

export const taskRepo = {
  async put(task: Task) {
    const db = await getDB();
    await db.put('tasks', task);
  },
  async delete(id: string) {
    const db = await getDB();
    await db.delete('tasks', id);
  },
  async all(): Promise<Task[]> {
    const db = await getDB();
    return db.getAll('tasks');
  },
};

export const reminderEventRepo = {
  async put(event: ReminderEvent) {
    const db = await getDB();
    await db.put('reminder_events', event);
  },
  async forTask(taskId: string): Promise<ReminderEvent[]> {
    const db = await getDB();
    return db.getAllFromIndex('reminder_events', 'by-task', taskId);
  },
};

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await db.clear('captures');
  await db.clear('tasks');
  await db.clear('reminder_events');
}
