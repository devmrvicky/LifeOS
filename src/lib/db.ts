import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Capture, ReminderEvent, Task } from '../types';

// ---------------------------------------------------------------------------
// Local-first storage. This mirrors the `captures` / `tasks` /
// `reminder_events` tables in supabase/schema.sql field-for-field, so a
// future sync layer is a straight upsert in both directions rather than a
// remodel.
//
// Nothing outside this file and src/lib/storage/ talks to idb directly —
// see src/repositories/ for the domain-facing API the rest of the app uses.
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

export const STORE_NAMES = {
  captures: 'captures',
  tasks: 'tasks',
  reminderEvents: 'reminder_events',
} as const;
