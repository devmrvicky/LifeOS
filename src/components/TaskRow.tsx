import { Link } from 'react-router-dom';
import type { Task } from '../types';
import { CATEGORY_META } from '../utils/categoryMeta';
import { formatISODateShort, formatTime12h } from '../utils/dateUtils';

function metaLine(task: Task): string {
  const parts: string[] = [];
  if (task.amount != null) {
    parts.push(`${task.currency === 'INR' ? '₹' : task.currency ?? ''}${task.amount.toLocaleString('en-IN')}`);
  }
  const date = task.due_date ?? task.event_date;
  if (date) {
    const time = formatTime12h(task.reminder_time ?? null);
    parts.push(task.due_date ? `Due ${formatISODateShort(date)}` : formatISODateShort(date));
    if (time && task.event_date) parts.push(time);
  }
  return parts.join(' · ');
}

export function TaskRow({ task }: { task: Task }) {
  const meta = CATEGORY_META[task.category];
  const Icon = meta.icon;

  return (
    <Link
      to={`/tasks/${task.id}`}
      className="flex items-center gap-3 border-b py-3.5 last:border-b-0"
      style={{ borderColor: 'var(--color-line)' }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: meta.soft, color: meta.color }}
      >
        <Icon size={16} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{task.title}</span>
        <span className="block truncate text-xs text-ink-soft">{metaLine(task) || meta.label}</span>
      </span>
      {task.priority === 'high' && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--color-urgent)' }} />
      )}
    </Link>
  );
}
