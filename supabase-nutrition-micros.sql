-- Adds fiber/sugar/sodium columns so logged foods can carry full nutrition
-- from the USDA / Open Food Facts data. Run in Supabase SQL Editor.
-- Safe to run more than once. The app works without this (micros just aren't stored).
ALTER TABLE nutrition_entries ADD COLUMN IF NOT EXISTS fiber_g   numeric;
ALTER TABLE nutrition_entries ADD COLUMN IF NOT EXISTS sugar_g   numeric;
ALTER TABLE nutrition_entries ADD COLUMN IF NOT EXISTS sodium_mg numeric;
