import { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useTaskStore } from '../store/taskStore';
import { TaskRow } from '../components/TaskRow';
import { EmptyState } from '../components/EmptyState';
import { taskRepository } from '../repositories';
import type { Task } from '../types';

export default function TasksPage() {
  const { tasks, loaded, load } = useTaskStore();
  const [showCompleted, setShowCompleted] = useState(false);
  const [completed, setCompleted] = useState<Task[]>([]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (showCompleted) {
      taskRepository.all().then((all) => setCompleted(all.filter((t) => t.status === 'completed')));
    }
  }, [showCompleted, tasks]);

  if (!loaded) return null;

  const pending = [...tasks]
    .filter((t) => t.status === 'pending')
    .sort((a, b) => (a.due_date ?? a.event_date ?? '9999').localeCompare(b.due_date ?? b.event_date ?? '9999'));

  return (
    <div className="mx-auto max-w-md px-5 pb-28 pt-8">
      <h1 className="mb-5 text-2xl font-semibold text-ink">Tasks</h1>

      {pending.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={32} strokeWidth={1.6} />}
          headline="No open tasks."
          body="Everything you've captured and confirmed will show up here."
        />
      ) : (
        <div className="rounded-2xl border bg-surface px-4" style={{ borderColor: 'var(--color-line)' }}>
          {pending.map((t) => <TaskRow key={t.id} task={t} />)}
        </div>
      )}

      <button
        onClick={() => setShowCompleted((v) => !v)}
        className="mt-6 text-sm font-medium text-ink-soft"
      >
        {showCompleted ? 'Hide completed' : 'Show completed'}
      </button>

      {showCompleted && (
        <div className="mt-3 rounded-2xl border bg-surface px-4" style={{ borderColor: 'var(--color-line)' }}>
          {completed.length === 0 ? (
            <p className="py-4 text-sm text-ink-soft">No completed tasks yet.</p>
          ) : (
            completed.map((t) => <TaskRow key={t.id} task={t} />)
          )}
        </div>
      )}
    </div>
  );
}
