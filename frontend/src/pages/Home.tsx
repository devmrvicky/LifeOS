import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Inbox } from 'lucide-react';
import { useTaskStore, selectToday, selectUpcoming, selectOverdue } from '../store/taskStore';
import { TaskRow } from '../components/TaskRow';
import { EmptyState } from '../components/EmptyState';
import { analytics } from '../services/analyticsService';

export default function HomePage() {
  const navigate = useNavigate();
  const { tasks, loaded, load } = useTaskStore();

  useEffect(() => {
    load();
    analytics.track('app_opened');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded) return null;

  const today = selectToday(tasks);
  const overdue = selectOverdue(tasks);
  const upcoming = selectUpcoming(tasks).slice(0, 8);
  const recent = [...tasks].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);

  const isEmpty = tasks.length === 0;

  return (
    <div className="mx-auto max-w-md px-5 pb-28 pt-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft" style={{ letterSpacing: '0.04em' }}>LifeOS</p>
          <h1 className="text-2xl font-semibold text-ink">Home</h1>
        </div>
        <button
          onClick={() => navigate('/capture')}
          className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          <Plus size={16} /> Capture Something
        </button>
      </header>

      {isEmpty ? (
        <EmptyState
          icon={<Inbox size={32} strokeWidth={1.6} />}
          headline="Nothing to remember yet."
          body="Upload a screenshot, PDF, or paste something important. LifeOS will figure out what you need to remember."
          action={
            <button
              onClick={() => navigate('/capture')}
              className="mt-2 rounded-full px-5 py-2.5 text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              Capture Something
            </button>
          }
        />
      ) : (
        <div className="space-y-8">
          {(overdue.length > 0 || today.length > 0) && (
            <Section title="Today">
              {overdue.map((t) => <TaskRow key={t.id} task={t} />)}
              {today.map((t) => <TaskRow key={t.id} task={t} />)}
            </Section>
          )}

          {upcoming.length > 0 && (
            <Section title="Upcoming">
              {upcoming.map((t) => <TaskRow key={t.id} task={t} />)}
            </Section>
          )}

          {recent.length > 0 && (
            <Section title="Recently Captured">
              {recent.map((t) => <TaskRow key={t.id} task={t} />)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-ink-soft">{title}</h2>
      <div className="rounded-2xl border bg-surface px-4" style={{ borderColor: 'var(--color-line)' }}>
        {children}
      </div>
    </section>
  );
}
