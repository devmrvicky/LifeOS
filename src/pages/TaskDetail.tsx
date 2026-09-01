import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Trash2, ChevronLeft } from 'lucide-react';
import { useTaskStore } from '../store/taskStore';
import { CATEGORY_META } from '../utils/categoryMeta';
import { formatISODateLong, formatTime12h } from '../utils/dateUtils';
import { TaskFieldsForm, type TaskFormValue } from '../components/TaskFieldsForm';

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tasks, loaded, load, updateTask, completeTask, deleteTask } = useTaskStore();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const task = tasks.find((t) => t.id === id);

  const [form, setForm] = useState<TaskFormValue | null>(null);
  useEffect(() => {
    if (task) {
      setForm({
        title: task.title,
        description: task.description ?? '',
        category: task.category,
        amount: task.amount != null ? String(task.amount) : '',
        currency: task.currency ?? '',
        due_date: task.due_date ?? '',
        event_date: task.event_date ?? '',
        event_time: task.event_time ?? '',
        reminder_date: task.reminder_date ?? '',
        reminder_time: task.reminder_time ?? '',
        priority: task.priority,
      });
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return null;

  if (!task) {
    return (
      <div className="mx-auto max-w-md px-5 pt-8">
        <p className="text-sm text-ink-soft">This task isn't here anymore.</p>
        <button onClick={() => navigate('/tasks')} className="mt-3 text-sm font-medium text-accent">
          Back to tasks
        </button>
      </div>
    );
  }

  const meta = CATEGORY_META[task.category];

  async function saveEdit() {
    if (!form) return;
    await updateTask(task!.id, {
      title: form.title.trim() || task!.title,
      description: form.description.trim() || null,
      category: form.category,
      amount: form.amount ? Number(form.amount) : null,
      currency: form.amount ? form.currency || 'INR' : null,
      due_date: form.due_date || null,
      event_date: form.event_date || null,
      event_time: form.event_time || null,
      reminder_date: form.reminder_date || null,
      reminder_time: form.reminder_time || null,
      priority: form.priority,
    });
    setEditing(false);
  }

  return (
    <div className="mx-auto max-w-md px-5 pb-28 pt-6">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-ink-soft">
        <ChevronLeft size={16} /> Back
      </button>

      {editing && form ? (
        <>
          <TaskFieldsForm value={form} onChange={setForm} />
          <div className="mt-4 flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 rounded-full border py-2.5 text-sm font-medium text-ink" style={{ borderColor: 'var(--color-line)' }}>
              Cancel
            </button>
            <button onClick={saveEdit} className="flex-1 rounded-full py-2.5 text-sm font-medium text-white" style={{ backgroundColor: 'var(--color-accent)' }}>
              Save
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: meta.soft, color: meta.color }}>
              {meta.label}
            </span>
            {task.status === 'completed' && (
              <span className="text-xs font-medium" style={{ color: 'var(--color-accent)' }}>Completed</span>
            )}
          </div>
          <h1 className="text-xl font-semibold text-ink">{task.title}</h1>
          {task.description && <p className="mt-1 text-sm text-ink-soft">{task.description}</p>}

          {task.amount != null && (
            <p className="mt-3 text-2xl font-semibold text-ink">
              {task.currency === 'INR' ? '₹' : `${task.currency} `}
              {task.amount.toLocaleString('en-IN')}
            </p>
          )}

          <div className="mt-4 space-y-3 rounded-2xl border bg-surface px-4 py-3 text-sm" style={{ borderColor: 'var(--color-line)' }}>
            {task.due_date && <DetailRow label="Due" value={formatISODateLong(task.due_date)} />}
            {task.event_date && <DetailRow label="Event" value={`${formatISODateLong(task.event_date)}${task.event_time ? ` · ${formatTime12h(task.event_time)}` : ''}`} />}
            {task.reminder_date && <DetailRow label="Reminder" value={`${formatISODateLong(task.reminder_date)}${task.reminder_time ? ` · ${formatTime12h(task.reminder_time)}` : ''}`} />}
            <DetailRow label="Priority" value={task.priority[0].toUpperCase() + task.priority.slice(1)} />
            {task.source_type && <DetailRow label="Source" value={task.source_type[0].toUpperCase() + task.source_type.slice(1)} />}
            <DetailRow label="Created" value={new Date(task.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
          </div>

          <div className="mt-5 flex gap-2">
            {task.status !== 'completed' && (
              <button
                onClick={() => completeTask(task.id)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                <Check size={16} /> Complete
              </button>
            )}
            <button onClick={() => setEditing(true)} className="flex-1 rounded-full border py-2.5 text-sm font-medium text-ink" style={{ borderColor: 'var(--color-line)' }}>
              Edit
            </button>
          </div>

          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="mt-4 flex w-full items-center justify-center gap-1.5 text-sm" style={{ color: 'var(--color-urgent)' }}>
              <Trash2 size={14} /> Delete
            </button>
          ) : (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <span className="text-ink-soft">Delete this task?</span>
              <button onClick={() => setConfirmDelete(false)} className="font-medium text-ink-soft">No</button>
              <button
                onClick={async () => {
                  await deleteTask(task.id);
                  navigate('/tasks');
                }}
                className="font-medium"
                style={{ color: 'var(--color-urgent)' }}
              >
                Yes, delete
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
