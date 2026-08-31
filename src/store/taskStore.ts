import { create } from 'zustand';
import type { Task, TaskCategory, TaskPriority } from '../types';
import { taskRepo } from '../lib/db';
import { getLocalUserId } from '../lib/localUser';
import { analytics } from '../services/analyticsService';
import { todayISO } from '../utils/dateUtils';

export interface NewTaskInput {
  title: string;
  description: string | null;
  category: TaskCategory;
  amount: number | null;
  currency: string | null;
  event_date: string | null;
  due_date: string | null;
  reminder_date: string | null;
  reminder_time: string | null;
  priority: TaskPriority;
  recurring: boolean;
  capture_id: string | null;
  confidence: number | null;
  source_type: Task['source_type'];
}

interface TaskStore {
  tasks: Task[];
  loaded: boolean;
  load: () => Promise<void>;
  createTask: (input: NewTaskInput) => Promise<Task>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loaded: false,

  async load() {
    const tasks = await taskRepo.all();
    set({ tasks: tasks.filter((t) => t.status !== 'deleted'), loaded: true });
  },

  async createTask(input) {
    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      user_id: getLocalUserId(),
      capture_id: input.capture_id,
      title: input.title,
      description: input.description,
      category: input.category,
      amount: input.amount,
      currency: input.currency,
      event_date: input.event_date,
      due_date: input.due_date,
      reminder_date: input.reminder_date,
      reminder_time: input.reminder_time,
      priority: input.priority,
      recurring: input.recurring,
      status: 'pending',
      confidence: input.confidence,
      source_type: input.source_type,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    await taskRepo.put(task);
    set({ tasks: [task, ...get().tasks] });
    analytics.track('task_created', { category: task.category, has_reminder: !!task.reminder_date });
    if (task.reminder_date) {
      analytics.track('reminder_created', { task_id: task.id });
    }
    return task;
  },

  async updateTask(id, patch) {
    const existing = get().tasks.find((t) => t.id === id);
    if (!existing) return;
    const updated: Task = { ...existing, ...patch, updated_at: new Date().toISOString() };
    await taskRepo.put(updated);
    set({ tasks: get().tasks.map((t) => (t.id === id ? updated : t)) });
    analytics.track('task_edited', { task_id: id });
  },

  async completeTask(id) {
    const existing = get().tasks.find((t) => t.id === id);
    if (!existing) return;
    const updated: Task = {
      ...existing,
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await taskRepo.put(updated);
    set({ tasks: get().tasks.map((t) => (t.id === id ? updated : t)) });
    analytics.track('task_completed', { task_id: id });
  },

  async deleteTask(id) {
    const existing = get().tasks.find((t) => t.id === id);
    if (!existing) return;
    const updated: Task = { ...existing, status: 'deleted', updated_at: new Date().toISOString() };
    await taskRepo.put(updated);
    set({ tasks: get().tasks.filter((t) => t.id !== id) });
    analytics.track('task_deleted', { task_id: id });
  },
}));

export function selectToday(tasks: Task[]): Task[] {
  const today = todayISO();
  return tasks.filter(
    (t) => t.status === 'pending' && (t.due_date === today || t.event_date === today || t.reminder_date === today)
  );
}

export function selectUpcoming(tasks: Task[]): Task[] {
  const today = todayISO();
  return tasks
    .filter((t) => t.status === 'pending' && ((t.due_date && t.due_date > today) || (t.event_date && t.event_date > today)))
    .sort((a, b) => (a.due_date ?? a.event_date ?? '').localeCompare(b.due_date ?? b.event_date ?? ''));
}

export function selectOverdue(tasks: Task[]): Task[] {
  const today = todayISO();
  return tasks.filter((t) => t.status === 'pending' && t.due_date && t.due_date < today);
}
