import type { TaskCategory, TaskPriority } from '../types';
import { CATEGORY_META, CATEGORY_ORDER } from '../utils/categoryMeta';

export interface TaskFormValue {
  title: string;
  description: string;
  category: TaskCategory;
  amount: string; // kept as string while editing, parsed on submit
  currency: string;
  due_date: string;
  event_date: string;
  reminder_date: string;
  reminder_time: string;
  priority: TaskPriority;
}

export const BLANK_TASK_FORM: TaskFormValue = {
  title: '',
  description: '',
  category: 'other',
  amount: '',
  currency: '',
  due_date: '',
  event_date: '',
  reminder_date: '',
  reminder_time: '',
  priority: 'medium',
};

const inputClass =
  'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent';
const labelClass = 'mb-1 block text-xs font-medium text-ink-soft';

interface TaskFieldsFormProps {
  value: TaskFormValue;
  onChange: (value: TaskFormValue) => void;
  titleAutoFocus?: boolean;
}

export function TaskFieldsForm({ value, onChange, titleAutoFocus }: TaskFieldsFormProps) {
  function set<K extends keyof TaskFormValue>(key: K, v: TaskFormValue[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Title</label>
        <input autoFocus={titleAutoFocus} className={inputClass} value={value.title} onChange={(e) => set('title', e.target.value)} placeholder="What is this?" />
      </div>
      <div>
        <label className={labelClass}>Description</label>
        <textarea className={inputClass} rows={2} value={value.description} onChange={(e) => set('description', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Amount</label>
          <input className={inputClass} inputMode="decimal" value={value.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className={labelClass}>Currency</label>
          <input className={inputClass} value={value.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} placeholder="INR" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Due date</label>
          <input type="date" className={inputClass} value={value.due_date} onChange={(e) => set('due_date', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Event date</label>
          <input type="date" className={inputClass} value={value.event_date} onChange={(e) => set('event_date', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Reminder date</label>
          <input type="date" className={inputClass} value={value.reminder_date} onChange={(e) => set('reminder_date', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Reminder time</label>
          <input type="time" className={inputClass} value={value.reminder_time} onChange={(e) => set('reminder_time', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Category</label>
          <select className={inputClass} value={value.category} onChange={(e) => set('category', e.target.value as TaskCategory)}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{CATEGORY_META[c].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Priority</label>
          <select className={inputClass} value={value.priority} onChange={(e) => set('priority', e.target.value as TaskPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
    </div>
  );
}
