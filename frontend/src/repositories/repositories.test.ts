import { describe, it, expect, beforeEach } from 'vitest';
import { TaskRepository } from './TaskRepository';
import { CaptureRepository } from './CaptureRepository';
import { createIndexedDBAdapter } from '../lib/storage/indexedDBAdapter';
import type { Task, Capture } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: 'user-1',
    capture_id: null,
    title: 'Test task',
    description: null,
    category: 'other',
    amount: null,
    currency: null,
    event_date: null,
    event_time: null,
    due_date: null,
    reminder_date: null,
    reminder_time: null,
    priority: 'medium',
    recurring: false,
    status: 'pending',
    confidence: null,
    source_type: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    ...overrides,
  };
}

// A fresh store name per test file run keeps this isolated from the app's
// real 'tasks'/'captures' stores that lib/db.ts defines, without needing to
// reset the whole fake-indexeddb database between tests.
describe('TaskRepository', () => {
  let repo: TaskRepository;

  beforeEach(async () => {
    // Reuse the app's real schema/store via the same adapter the app uses —
    // this exercises the exact code path production runs, not a parallel one.
    const { getDB } = await import('../lib/db');
    const db = await getDB();
    await db.clear('tasks');
    repo = new TaskRepository(createIndexedDBAdapter<Task>('tasks'));
  });

  it('creates and retrieves a task', async () => {
    const task = makeTask({ title: 'Pay electricity bill' });
    await repo.put(task);
    const found = await repo.get(task.id);
    expect(found?.title).toBe('Pay electricity bill');
  });

  it('lists all tasks', async () => {
    await repo.put(makeTask({ title: 'A' }));
    await repo.put(makeTask({ title: 'B' }));
    const all = await repo.all();
    expect(all.length).toBe(2);
  });

  it('updates a task in place (edit)', async () => {
    const task = makeTask({ title: 'Original' });
    await repo.put(task);
    await repo.put({ ...task, title: 'Edited' });
    const found = await repo.get(task.id);
    expect(found?.title).toBe('Edited');
  });

  it('marks a task completed', async () => {
    const task = makeTask();
    await repo.put(task);
    await repo.put({ ...task, status: 'completed', completed_at: new Date().toISOString() });
    const found = await repo.get(task.id);
    expect(found?.status).toBe('completed');
    expect(found?.completed_at).not.toBeNull();
  });

  it('deletes a task', async () => {
    const task = makeTask();
    await repo.put(task);
    await repo.delete(task.id);
    const found = await repo.get(task.id);
    expect(found).toBeUndefined();
  });

  it('filters by status via the by-status index', async () => {
    await repo.put(makeTask({ status: 'pending' }));
    await repo.put(makeTask({ status: 'completed' }));
    await repo.put(makeTask({ status: 'pending' }));
    const pending = await repo.byStatus('pending');
    expect(pending.length).toBe(2);
  });

  it('handles date fields as plain ISO strings without coercion loss', async () => {
    const task = makeTask({ due_date: '2026-09-12', event_date: null, event_time: null });
    await repo.put(task);
    const found = await repo.get(task.id);
    expect(found?.due_date).toBe('2026-09-12');
  });
});

describe('CaptureRepository', () => {
  let repo: CaptureRepository;

  beforeEach(async () => {
    const { getDB } = await import('../lib/db');
    const db = await getDB();
    await db.clear('captures');
    repo = new CaptureRepository(createIndexedDBAdapter<Capture>('captures'));
  });

  it('sorts captures by most recent first', async () => {
    const older: Capture = {
      id: 'c1', user_id: 'u1', source_type: 'text', original_text: 'first',
      file_reference: null, processing_status: 'success', extracted: null,
      error_message: null, created_at: '2026-01-01T00:00:00.000Z',
    };
    const newer: Capture = { ...older, id: 'c2', original_text: 'second', created_at: '2026-06-01T00:00:00.000Z' };
    await repo.put(older);
    await repo.put(newer);
    const sorted = await repo.allSortedByRecent();
    expect(sorted[0].id).toBe('c2');
  });
});
