-- ============================================================
-- Life Dashboard — Todo v2 Schema
-- Run in Supabase → SQL Editor → New query → Run
-- ============================================================

-- Daily routine template tasks
create table if not exists routine_tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  note text,
  position integer default 0,
  active boolean default true,
  created_at timestamptz default now()
);
alter table routine_tasks enable row level security;
create policy "Users manage own routine_tasks" on routine_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Per-date completion records (routine resets automatically each day)
create table if not exists routine_completions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  routine_task_id uuid references routine_tasks(id) on delete cascade not null,
  completed_date date not null,
  created_at timestamptz default now(),
  unique(routine_task_id, completed_date)
);
alter table routine_completions enable row level security;
create policy "Users manage own routine_completions" on routine_completions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- General task backlog
create table if not exists task_list (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  priority text default 'normal' check (priority in ('high', 'normal', 'low')),
  due_date date,
  notes text,
  completed boolean default false,
  completed_at timestamptz,
  position integer default 0,
  created_at timestamptz default now()
);
alter table task_list enable row level security;
create policy "Users manage own task_list" on task_list
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Today's Focus tasks
create table if not exists focus_tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  priority text default 'normal' check (priority in ('high', 'normal', 'low')),
  notes text,
  completed boolean default false,
  focus_date date not null,
  task_list_id uuid references task_list(id) on delete set null,
  position integer default 0,
  created_at timestamptz default now()
);
alter table focus_tasks enable row level security;
create policy "Users manage own focus_tasks" on focus_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
