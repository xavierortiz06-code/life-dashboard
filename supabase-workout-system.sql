-- ─────────────────────────────────────────
-- WORKOUT SYSTEM — run this in Supabase SQL Editor
-- ─────────────────────────────────────────

-- Exercise library (one row per saved lift)
CREATE TABLE IF NOT EXISTS exercises (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users NOT NULL,
  name         text NOT NULL,
  muscle_group text NOT NULL DEFAULT 'Other',
  created_at   timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own exercises"
  ON exercises FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Logged sets (every set of every workout)
CREATE TABLE IF NOT EXISTS workout_sets (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users NOT NULL,
  exercise_id  uuid REFERENCES exercises NOT NULL,
  logged_date  date NOT NULL,
  set_number   integer NOT NULL DEFAULT 1,
  weight       numeric NOT NULL,
  reps         integer NOT NULL,
  notes        text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own workout_sets"
  ON workout_sets FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Weekly training split (one row per day per user)
CREATE TABLE IF NOT EXISTS weekly_split (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users NOT NULL,
  day_of_week   integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  day_name      text NOT NULL DEFAULT 'Rest',
  exercises     text[] DEFAULT '{}',
  UNIQUE(user_id, day_of_week)
);
ALTER TABLE weekly_split ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own weekly_split"
  ON weekly_split FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Body composition log
CREATE TABLE IF NOT EXISTS body_measurements (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users NOT NULL,
  logged_date  date NOT NULL,
  weight_lbs   numeric,
  chest_in     numeric,
  waist_in     numeric,
  arms_in      numeric,
  legs_in      numeric,
  notes        text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own body_measurements"
  ON body_measurements FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add macro columns to nutrition_entries (safe to run even if already added)
ALTER TABLE nutrition_entries
  ADD COLUMN IF NOT EXISTS protein_g  numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carbs_g    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fat_g      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meal_tag   text    DEFAULT 'general';
