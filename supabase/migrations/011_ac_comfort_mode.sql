-- Comfort mode table + structured goal fields for the closed-loop executor.
--
-- The table may already exist (it was created inline before this migration was
-- formalised). CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS make it
-- safe to run in either case.

CREATE TABLE IF NOT EXISTS public.ac_comfort_mode (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  active       boolean     NOT NULL DEFAULT false,
  intent_text  text,
  activated_at timestamptz DEFAULT now(),
  activated_by text,
  expires_at   timestamptz
);

-- Structured goal fields read by comfort_mode_executor.py.
ALTER TABLE public.ac_comfort_mode
  ADD COLUMN IF NOT EXISTS goal_temp_f  numeric(4,1),
  ADD COLUMN IF NOT EXISTS goal_room    text CHECK (goal_room IN ('bedroom', 'living_room'));

ALTER TABLE public.ac_comfort_mode ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'ac_comfort_mode'
      AND policyname  = 'anon_all_comfort_mode'
  ) THEN
    EXECUTE 'CREATE POLICY anon_all_comfort_mode ON public.ac_comfort_mode
             FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END$$;
