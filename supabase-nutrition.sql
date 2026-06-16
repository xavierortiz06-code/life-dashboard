-- Nutrition entries table
CREATE TABLE IF NOT EXISTS nutrition_entries (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users NOT NULL,
  date       date NOT NULL,
  food_name  text NOT NULL,
  calories   integer NOT NULL CHECK (calories > 0),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE nutrition_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own nutrition entries"
  ON nutrition_entries FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
