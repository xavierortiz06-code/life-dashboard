-- Add schedule block assignment to routine tasks
-- Run this in Supabase SQL Editor
alter table routine_tasks add column if not exists schedule_block text;
