-- ============================================================
-- Life Dashboard — Schedule Cross-Device Sync
-- Run in Supabase → SQL Editor → New query → Run
-- ============================================================

-- Stores tasks placed in day-view time blocks (syncs across devices)
create table if not exists schedule_day_tasks (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  task_date date not null,
  section_id text not null,
  title text not null,
  time_slot text,
  tag text,
  completed boolean default false,
  completed_at timestamptz,
  position integer default 0,
  source_type text default 'manual',
  source_id uuid,
  linked_type text,
  created_at timestamptz default now()
);

alter table schedule_day_tasks enable row level security;

create policy "Users manage own schedule_day_tasks" on schedule_day_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_sdt_user_date
  on schedule_day_tasks(user_id, task_date);

-- Required for real-time DELETE events to include old row data
alter table schedule_day_tasks replica identity full;

-- Enable real-time for this table
alter publication supabase_realtime add table schedule_day_tasks;
