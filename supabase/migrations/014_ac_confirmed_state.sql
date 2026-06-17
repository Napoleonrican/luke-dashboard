-- Add confirmed AC state columns to ac_preferences.
-- The Pi executor scripts write these after every successful SmartHQ apply,
-- using the already-open WebSocket connection (no extra hardware poll).
-- The dashboard reads them to show the actual AC state instead of inferring
-- it from the last log entry.
ALTER TABLE ac_preferences
  ADD COLUMN IF NOT EXISTS ac_confirmed_power      BOOLEAN,
  ADD COLUMN IF NOT EXISTS ac_confirmed_setpoint_f INTEGER,
  ADD COLUMN IF NOT EXISTS ac_confirmed_mode       TEXT,
  ADD COLUMN IF NOT EXISTS ac_confirmed_fan        TEXT,
  ADD COLUMN IF NOT EXISTS ac_confirmed_source     TEXT,
  ADD COLUMN IF NOT EXISTS ac_confirmed_at         TIMESTAMPTZ;
