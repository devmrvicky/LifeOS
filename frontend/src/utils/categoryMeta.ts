import {
  Receipt, CalendarCheck, Plane, GraduationCap, Briefcase, FileText, User, CircleDot,
} from 'lucide-react';
import type { TaskCategory } from '../types';

export const CATEGORY_META: Record<
  TaskCategory,
  { label: string; icon: typeof Receipt; color: string; soft: string }
> = {
  bills: { label: 'Bills', icon: Receipt, color: 'var(--color-cat-bills)', soft: 'var(--color-cat-bills-soft)' },
  appointments: { label: 'Appointments', icon: CalendarCheck, color: 'var(--color-cat-appointments)', soft: 'var(--color-cat-appointments-soft)' },
  travel: { label: 'Travel', icon: Plane, color: 'var(--color-cat-travel)', soft: 'var(--color-cat-travel-soft)' },
  study: { label: 'Study', icon: GraduationCap, color: 'var(--color-cat-study)', soft: 'var(--color-cat-study-soft)' },
  work: { label: 'Work', icon: Briefcase, color: 'var(--color-cat-work)', soft: 'var(--color-cat-work-soft)' },
  documents: { label: 'Documents', icon: FileText, color: 'var(--color-cat-documents)', soft: 'var(--color-cat-documents-soft)' },
  personal: { label: 'Personal', icon: User, color: 'var(--color-cat-personal)', soft: 'var(--color-cat-personal-soft)' },
  other: { label: 'Other', icon: CircleDot, color: 'var(--color-cat-other)', soft: 'var(--color-cat-other-soft)' },
};

export const CATEGORY_ORDER: TaskCategory[] = [
  'bills', 'appointments', 'travel', 'study', 'work', 'documents', 'personal', 'other',
];
