import { useState, type ReactNode } from 'react';
import type { ExtractedTaskData } from '../types';
import { CATEGORY_META } from '../utils/categoryMeta';
import { TaskFieldsForm, type TaskFormValue } from './TaskFieldsForm';

export type ConfirmationFormValue = TaskFormValue;

function toFormValue(data: ExtractedTaskData): ConfirmationFormValue {
  return {
    title: data.title ?? '',
    description: data.description ?? '',
    category: data.category ?? 'other',
    amount: data.amount != null ? String(data.amount) : '',
    currency: data.currency ?? (data.amount != null ? 'INR' : ''),
    due_date: data.due_date ?? '',
    event_date: data.event_date ?? '',
    reminder_date: data.reminder_date ?? '',
    reminder_time: data.reminder_time ?? '',
    priority: data.priority ?? 'medium',
  };
}

interface ConfirmationCardProps {
  extraction: ExtractedTaskData;
  confidence: number;
  onConfirm: (value: ConfirmationFormValue) => void;
  onDiscard: () => void;
}

export function ConfirmationCard({ extraction, confidence, onConfirm, onDiscard }: ConfirmationCardProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<ConfirmationFormValue>(toFormValue(extraction));

  const meta = CATEGORY_META[value.category];
  const lowConfidence = confidence < 0.6;

  if (!editing) {
    return (
      <div className="overflow-hidden rounded-2xl border bg-surface" style={{ borderColor: 'var(--color-line)' }}>
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--color-line)' }}>
          <p className="text-base font-medium text-ink">{value.title || 'Untitled'}</p>
          {value.amount && (
            <p className="mt-1 text-2xl font-semibold text-ink">
              {value.currency === 'INR' ? '₹' : `${value.currency} `}
              {Number(value.amount).toLocaleString('en-IN')}
            </p>
          )}
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          {(value.due_date || value.event_date) && (
            <Row label={value.due_date ? 'Due' : 'When'} value={formatDatePretty(value.due_date || value.event_date, value.event_date ? value.reminder_time : '')} />
          )}
          {value.reminder_date && (
            <Row label="Suggested reminder" value={formatDatePretty(value.reminder_date, value.reminder_time)} accent />
          )}
          <Row
            label="Category"
            value={
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: meta.soft, color: meta.color }}>
                {meta.label}
              </span>
            }
          />
          {lowConfidence && (
            <p className="rounded-lg px-3 py-2 text-xs text-ink-soft" style={{ backgroundColor: 'var(--color-accent-soft)' }}>
              I'm not fully sure about this one — worth a quick check before you confirm.
            </p>
          )}
        </div>
        <div className="flex gap-2 border-t px-5 py-4" style={{ borderColor: 'var(--color-line)' }}>
          <button
            onClick={() => setEditing(true)}
            className="flex-1 rounded-full border py-2.5 text-sm font-medium text-ink"
            style={{ borderColor: 'var(--color-line)' }}
          >
            Edit
          </button>
          <button
            onClick={() => onConfirm(value)}
            className="flex-1 rounded-full py-2.5 text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            Create Reminder
          </button>
        </div>
        <button onClick={onDiscard} className="w-full pb-4 text-center text-xs text-ink-soft">
          Discard this capture
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-surface p-5" style={{ borderColor: 'var(--color-line)' }}>
      <TaskFieldsForm value={value} onChange={setValue} />
      <div className="flex gap-2 pt-1">
        <button onClick={() => setEditing(false)} className="flex-1 rounded-full border py-2.5 text-sm font-medium text-ink" style={{ borderColor: 'var(--color-line)' }}>
          Back
        </button>
        <button onClick={() => onConfirm(value)} className="flex-1 rounded-full py-2.5 text-sm font-medium text-white" style={{ backgroundColor: 'var(--color-accent)' }}>
          Create Reminder
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className={accent ? 'font-medium' : 'text-ink'} style={accent ? { color: 'var(--color-accent)' } : undefined}>
        {value}
      </span>
    </div>
  );
}

function formatDatePretty(dateISO: string, time?: string): string {
  if (!dateISO) return '—';
  const d = new Date(`${dateISO}T00:00:00`);
  const formatted = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  if (!time) return formatted;
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${formatted} · ${hour12}:${String(m).padStart(2, '0')} ${period}`;
}
