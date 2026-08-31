import type { Task } from '../types';
import { taskRepo } from '../lib/db';
import { getLocalUserId } from '../lib/localUser';
import { addDays, toISODate } from '../utils/dateUtils';

// Demo data is namespaced with a `demo-` id prefix and never mixed into a
// real capture flow — it exists only so Phase 1 can be tried immediately.
// Settings > "Load demo data" is the only place that calls this.
function demoTask(partial: Omit<Task, 'id' | 'user_id' | 'status' | 'created_at' | 'updated_at' | 'completed_at' | 'capture_id' | 'source_type' | 'confidence'>): Task {
  const now = new Date().toISOString();
  return {
    id: `demo-${crypto.randomUUID()}`,
    user_id: getLocalUserId(),
    capture_id: null,
    status: 'pending',
    created_at: now,
    updated_at: now,
    completed_at: null,
    source_type: 'text',
    confidence: 0.9,
    ...partial,
  };
}

export function buildDemoTasks(): Task[] {
  const today = new Date();
  return [
    demoTask({
      title: 'Electricity Bill',
      description: 'BESCOM monthly electricity bill',
      category: 'bills',
      amount: 1850,
      currency: 'INR',
      event_date: null,
      due_date: toISODate(today),
      reminder_date: toISODate(addDays(today, -1)),
      reminder_time: '09:00',
      priority: 'high',
      recurring: false,
    }),
    demoTask({
      title: 'Insurance Renewal',
      description: 'Two-wheeler insurance policy renewal',
      category: 'documents',
      amount: 2400,
      currency: 'INR',
      event_date: null,
      due_date: toISODate(addDays(today, 18)),
      reminder_date: toISODate(addDays(today, 15)),
      reminder_time: '09:00',
      priority: 'medium',
      recurring: false,
    }),
    demoTask({
      title: 'Doctor Appointment',
      description: 'General checkup appointment',
      category: 'appointments',
      amount: null,
      currency: null,
      event_date: toISODate(addDays(today, 21)),
      due_date: null,
      reminder_date: toISODate(addDays(today, 20)),
      reminder_time: '18:00',
      priority: 'medium',
      recurring: false,
    }),
    demoTask({
      title: 'SSC CGL Application Deadline',
      description: 'Submit SSC CGL application form',
      category: 'study',
      amount: null,
      currency: null,
      event_date: null,
      due_date: toISODate(addDays(today, 2)),
      reminder_date: toISODate(addDays(today, 1)),
      reminder_time: '09:00',
      priority: 'high',
      recurring: false,
    }),
    demoTask({
      title: 'Flight Ticket — DEL to BLR',
      description: 'Flight departure',
      category: 'travel',
      amount: null,
      currency: null,
      event_date: toISODate(addDays(today, 9)),
      due_date: null,
      reminder_date: toISODate(addDays(today, 8)),
      reminder_time: '18:00',
      priority: 'medium',
      recurring: false,
    }),
  ];
}

export async function loadDemoData(): Promise<void> {
  const tasks = buildDemoTasks();
  for (const task of tasks) {
    await taskRepo.put(task);
  }
}

export async function clearDemoData(): Promise<void> {
  const all = await taskRepo.all();
  for (const task of all) {
    if (task.id.startsWith('demo-')) {
      await taskRepo.delete(task.id);
    }
  }
}
