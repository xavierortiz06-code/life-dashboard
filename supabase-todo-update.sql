-- Run this in Supabase → SQL Editor → New query → Run
-- Adds two new columns needed for the enhanced todo features

ALTER TABLE todos ADD COLUMN IF NOT EXISTS queued boolean DEFAULT false;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS position integer DEFAULT 0;
