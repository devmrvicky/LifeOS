// ---------------------------------------------------------------------------
// Phase 1.2 status: this is an architectural placeholder, not a live data
// path. Reminders today are created and stored entirely client-side in
// IndexedDB (frontend/src/repositories/ReminderRepository.ts) — there is no
// server-side reminder database yet, and nothing in the app currently calls
// this service. It exists so the shape is ready for whenever server-side
// scheduling (needed for real push notifications — see Step 25/Phase 1.1
// README §7) gets built, without another redesign at that point.
//
// Browser timers are not production notifications — this file doesn't
// pretend otherwise, and neither does anything that calls it today (nothing
// does, yet).
// ---------------------------------------------------------------------------

import type { ReminderEvent } from '@shared/types';

export interface CreateReminderInput {
  taskId: string;
  scheduledFor: string; // ISO datetime
}

export interface ReminderService {
  createReminder(input: CreateReminderInput): Promise<ReminderEvent>;
  updateReminder(id: string, patch: Partial<Pick<ReminderEvent, 'scheduled_for' | 'status'>>): Promise<ReminderEvent>;
  cancelReminder(id: string): Promise<void>;
  getUpcomingReminders(beforeISO: string): Promise<ReminderEvent[]>;
}

/**
 * In-memory reference implementation, useful only for exercising the
 * interface in tests. A real deployment would back this with the
 * `reminder_events` table already defined in supabase/schema.sql, plus a
 * scheduler that polls or subscribes to it — see the Phase 1.1 README for
 * exactly what that requires.
 */
export class InMemoryReminderService implements ReminderService {
  private store = new Map<string, ReminderEvent>();

  async createReminder(input: CreateReminderInput): Promise<ReminderEvent> {
    const event: ReminderEvent = {
      id: crypto.randomUUID(),
      task_id: input.taskId,
      scheduled_for: input.scheduledFor,
      status: 'scheduled',
      completed_at: null,
      created_at: new Date().toISOString(),
    };
    this.store.set(event.id, event);
    return event;
  }

  async updateReminder(
    id: string,
    patch: Partial<Pick<ReminderEvent, 'scheduled_for' | 'status'>>
  ): Promise<ReminderEvent> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`reminder ${id} not found`);
    const updated = { ...existing, ...patch };
    this.store.set(id, updated);
    return updated;
  }

  async cancelReminder(id: string): Promise<void> {
    const existing = this.store.get(id);
    if (existing) this.store.set(id, { ...existing, status: 'dismissed' });
  }

  async getUpcomingReminders(beforeISO: string): Promise<ReminderEvent[]> {
    return [...this.store.values()].filter((e) => e.status === 'scheduled' && e.scheduled_for <= beforeISO);
  }
}
