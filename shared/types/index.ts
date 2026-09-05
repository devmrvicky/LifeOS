// ---------------------------------------------------------------------------
// LifeOS core domain types
// Mirrors the database schema (see supabase/schema.sql) so the client model
// and the eventual server model never drift apart.
// ---------------------------------------------------------------------------

export type SourceType = 'image' | 'pdf' | 'text';

export type TaskCategory =
  | 'bills'
  | 'appointments'
  | 'travel'
  | 'study'
  | 'work'
  | 'documents'
  | 'personal'
  | 'other';

export type TaskPriority = 'low' | 'medium' | 'high';

export type TaskStatus = 'pending' | 'completed' | 'deleted';

export type ProcessingStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'failed'
  | 'no_action';

// The strict shape the AI extraction layer must return. Every field the
// model didn't find comes back as `null`, never omitted and never guessed.
//
// Category naming note (Phase 1.1): the plural forms below ('bills',
// 'appointments', ...) are the original Phase 1 naming and are kept as-is —
// they're already wired through the UI, seed data, and IndexedDB records,
// and renaming them is a pure cosmetic churn with no functional upside.
export interface ExtractedTaskData {
  has_actionable_information: boolean;
  title: string | null;
  description: string | null;
  category: TaskCategory | null;
  amount: number | null;
  currency: string | null;
  due_date: string | null; // ISO YYYY-MM-DD
  event_date: string | null; // ISO YYYY-MM-DD
  event_time: string | null; // HH:mm, 24h — the event's own time, distinct from the suggested reminder time
  reminder_date: string | null; // ISO YYYY-MM-DD
  reminder_time: string | null; // HH:mm, 24h
  priority: TaskPriority | null;
  recurring: boolean;
  confidence: number; // 0..1
  source_type: SourceType;
}

export interface Capture {
  id: string;
  user_id: string;
  source_type: SourceType;
  original_text: string | null;
  file_reference: string | null; // object key / local blob id, never a raw secret URL
  processing_status: ProcessingStatus;
  extracted: ExtractedTaskData | null;
  error_message: string | null;
  created_at: string; // ISO datetime
}

export interface Task {
  id: string;
  user_id: string;
  capture_id: string | null;
  title: string;
  description: string | null;
  category: TaskCategory;
  amount: number | null;
  currency: string | null;
  event_date: string | null;
  event_time: string | null;
  due_date: string | null;
  reminder_date: string | null;
  reminder_time: string | null;
  priority: TaskPriority;
  recurring: boolean;
  status: TaskStatus;
  confidence: number | null;
  source_type: SourceType | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ReminderEvent {
  id: string;
  task_id: string;
  scheduled_for: string; // ISO datetime
  status: 'scheduled' | 'fired' | 'snoozed' | 'dismissed';
  completed_at: string | null;
  created_at: string;
}

// Every analytics event LifeOS tracks in Phase 1. Kept as a closed union so
// a typo can't silently create an untracked event name.
export type AnalyticsEvent =
  | 'app_opened'
  | 'capture_started'
  | 'capture_uploaded'
  | 'capture_processing'
  | 'ai_extraction_success'
  | 'ai_extraction_failed'
  | 'capture_confirmed'
  | 'task_created'
  | 'task_edited'
  | 'task_completed'
  | 'task_deleted'
  | 'reminder_created';

export interface AppError {
  code:
    | 'unsupported_file'
    | 'file_too_large'
    | 'ocr_failed'
    | 'ai_failed'
    | 'ai_unavailable'
    | 'ai_timeout'
    | 'ai_rate_limited'
    | 'invalid_ai_response'
    | 'missing_date'
    | 'no_actionable_information'
    | 'network_failed'
    | 'db_failed'
    | 'pdf_password_protected'
    | 'pdf_unreadable'
    | 'unknown';
  message: string; // already human-readable, safe to show directly
}
