-- ============================================================
-- Life Dashboard — Supabase Schema
-- Copy this entire file and paste it into:
--   Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- Workouts
create table if not exists workouts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  sets integer,
  reps integer,
  weight numeric,
  muscle_group text,
  date date not null,
  created_at timestamptz default now()
);
alter table workouts enable row level security;
create policy "Users manage own workouts" on workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Schedule events
create table if not exists schedule_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  date date not null,
  time time,
  category text default 'general',
  note text,
  created_at timestamptz default now()
);
alter table schedule_events enable row level security;
create policy "Users manage own events" on schedule_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Todos
create table if not exists todos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  priority text default 'normal',
  due_date date,
  completed boolean default false,
  created_at timestamptz default now()
);
alter table todos enable row level security;
create policy "Users manage own todos" on todos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Budget entries
create table if not exists budget_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('income', 'expense')),
  amount numeric not null check (amount >= 0),
  category text,
  description text,
  date date not null,
  created_at timestamptz default now()
);
alter table budget_entries enable row level security;
create policy "Users manage own budget entries" on budget_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Budget settings (monthly limit per user)
create table if not exists budget_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  monthly_limit numeric default 2000,
  created_at timestamptz default now()
);
alter table budget_settings enable row level security;
create policy "Users manage own budget settings" on budget_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Music pieces
create table if not exists music_pieces (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  artist text,
  instrument text,
  status text default 'learning' check (status in ('learning', 'practicing', 'mastered')),
  progress integer default 0 check (progress >= 0 and progress <= 100),
  created_at timestamptz default now()
);
alter table music_pieces enable row level security;
create policy "Users manage own music pieces" on music_pieces
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- User settings (display name, avatar, accent color)
create table if not exists user_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  display_name text,
  avatar_initials text,
  accent_color text default '#6366f1',
  created_at timestamptz default now()
);
alter table user_settings enable row level security;
create policy "Users manage own settings" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
