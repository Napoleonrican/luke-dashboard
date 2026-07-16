-- Schedule Override (formerly "Comfort Mode") — structured quick-action fields.
--
-- Adds an explicit power-off flag and explicit fan/mode selections so the
-- dashboard can offer a couple of one-tap buttons (turn AC off, pick fan speed,
-- pick cooling mode) alongside the freeform rationale text, instead of forcing
-- everything through free-text interpretation. goal_room / goal_temp_f stay as
-- they were (still parsed from free text server-side); this migration only adds
-- new optional columns.

ALTER TABLE public.ac_comfort_mode
  ADD COLUMN IF NOT EXISTS goal_power text CHECK (goal_power IN ('off')),
  ADD COLUMN IF NOT EXISTS goal_fan   text CHECK (goal_fan IN ('AUTO', 'LOW', 'MED', 'HIGH')),
  ADD COLUMN IF NOT EXISTS goal_mode  text CHECK (goal_mode IN ('COOL', 'ENERGY_SAVER'));
