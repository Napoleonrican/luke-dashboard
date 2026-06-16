-- Climate alert thresholds: global temperature bounds + low-battery level, shared
-- across devices via ac_preferences so the dashboard highlights out-of-range
-- temperatures (History page) and warns on low sensor batteries (Overview).
--
-- Temperatures are stored in °F to match ac_schedule.temp_f; the dashboard
-- converts for display when the unit is °C. Null low/high means "no bound".

ALTER TABLE ac_preferences
  ADD COLUMN IF NOT EXISTS alert_temp_min_f   numeric,                    -- null = no low bound
  ADD COLUMN IF NOT EXISTS alert_temp_max_f   numeric,                    -- null = no high bound
  ADD COLUMN IF NOT EXISTS alert_battery_pct  integer NOT NULL DEFAULT 20; -- warn below this %
