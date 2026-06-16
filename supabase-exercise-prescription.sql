-- Adds a prescription column to exercises so rep schemes parsed out of
-- imported names ("Preacher Curl- 2x 6-8 1x drop-set") have a home.
-- Run this in Supabase SQL Editor. Safe to run more than once.
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS prescription text;
