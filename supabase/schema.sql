-- LifeOS — Phase 1 database schema (Postgres / Supabase)
--
-- Phase 1 ships fully offline using IndexedDB (see src/lib/db.ts) with no
-- backend wired up. This schema is the target shape for when signed-in
-- sync is added: field names match src/types/index.ts 1:1 so the sync
-- layer is a straight upsert, not a remodel.

create extension if not exists "pgcrypto";

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  name text,
  created_at timestamptz not null default now()
);

create table captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_type text not null check (source_type in ('image', 'pdf', 'text')),
  original_text text,
  file_reference text,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'success', 'failed', 'no_action')),
  extracted jsonb,
  error_message text,
  created_at timestamptz not null default now()
);
create index captures_user_id_idx on captures(user_id);
create index captures_created_at_idx on captures(created_at desc);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  capture_id uuid references captures(id) on delete set null,
  title text not null,
  description text,
  category text not null check (
    category in ('bills', 'appointments', 'travel', 'study', 'work', 'documents', 'personal', 'other')
  ),
  amount numeric(12, 2),
  currency text,
  event_date date,
  due_date date,
  reminder_date date,
  reminder_time time,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  recurring boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'completed', 'deleted')),
  confidence numeric(3, 2),
  source_type text check (source_type in ('image', 'pdf', 'text')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index tasks_user_id_idx on tasks(user_id);
create index tasks_status_idx on tasks(status);
create index tasks_due_date_idx on tasks(due_date);
create index tasks_event_date_idx on tasks(event_date);

create table reminder_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'fired', 'snoozed', 'dismissed')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index reminder_events_task_id_idx on reminder_events(task_id);
create index reminder_events_scheduled_for_idx on reminder_events(scheduled_for);

-- Row-level security: every user can only ever see their own records.
alter table captures enable row level security;
alter table tasks enable row level security;
alter table reminder_events enable row level security;

create policy "captures_owner_only" on captures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tasks_owner_only" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "reminder_events_owner_only" on reminder_events
  for all using (
    exists (select 1 from tasks t where t.id = reminder_events.task_id and t.user_id = auth.uid())
  );

-- Entitlement scaffold (architecture only — no payment gateway in Phase 1).
create table entitlements (
  user_id uuid primary key references users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  usage_count integer not null default 0,
  monthly_limit integer not null default 20,
  subscription_status text not null default 'none',
  period_start date not null default date_trunc('month', now())::date
);
