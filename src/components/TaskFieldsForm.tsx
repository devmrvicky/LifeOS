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
  event_time: string;
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
  event_time: '',
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
  /** Disambiguates field ids when this form renders more than once on a page. */
  idPrefix?: string;
}

export function TaskFieldsForm({ value, onChange, titleAutoFocus, idPrefix = 'task' }: TaskFieldsFormProps) {
  function set<K extends keyof TaskFormValue>(key: K, v: TaskFormValue[K]) {
    onChange({ ...value, [key]: v });
  }
  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass} htmlFor={id('title')}>Title</label>
        <input id={id('title')} autoFocus={titleAutoFocus} className={inputClass} value={value.title} onChange={(e) => set('title', e.target.value)} placeholder="What is this?" />
      </div>
      <div>
        <label className={labelClass} htmlFor={id('description')}>Description</label>
        <textarea id={id('description')} className={inputClass} rows={2} value={value.description} onChange={(e) => set('description', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor={id('amount')}>Amount</label>
          <input id={id('amount')} className={inputClass} inputMode="decimal" value={value.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className={labelClass} htmlFor={id('currency')}>Currency</label>
          <input id={id('currency')} className={inputClass} value={value.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} placeholder="INR" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor={id('due_date')}>Due date</label>
          <input id={id('due_date')} type="date" className={inputClass} value={value.due_date} onChange={(e) => set('due_date', e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor={id('event_date')}>Event date</label>
          <input id={id('event_date')} type="date" className={inputClass} value={value.event_date} onChange={(e) => set('event_date', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor={id('event_time')}>Event time</label>
          <input id={id('event_time')} type="time" className={inputClass} value={value.event_time} onChange={(e) => set('event_time', e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor={id('priority')}>Priority</label>
          <select id={id('priority')} className={inputClass} value={value.priority} onChange={(e) => set('priority', e.target.value as TaskPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor={id('reminder_date')}>Reminder date</label>
          <input id={id('reminder_date')} type="date" className={inputClass} value={value.reminder_date} onChange={(e) => set('reminder_date', e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor={id('reminder_time')}>Reminder time</label>
          <input id={id('reminder_time')} type="time" className={inputClass} value={value.reminder_time} onChange={(e) => set('reminder_time', e.target.value)} />
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor={id('category')}>Category</label>
        <select id={id('category')} className={inputClass} value={value.category} onChange={(e) => set('category', e.target.value as TaskCategory)}>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{CATEGORY_META[c].label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
