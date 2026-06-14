-- Add a fan-speed column to the AC schedule.
-- Fan continuity matters on the AWFS12WW: in Eco the fan cycles off with the
-- compressor, so the unit's internal thermistor reads stale air and stops
-- cooling early (the room drifts ~3-4F above target overnight). A constant fan
-- gives accurate sensing and tighter control.
--
-- Values mirror the dashboard dropdown: 'Auto' | 'Low' | 'Medium' | 'High'.
-- The executor maps these to the SDK's AC_FAN_SETTING enum (AUTO/LOW/MED/HIGH).

ALTER TABLE ac_schedule ADD COLUMN IF NOT EXISTS fan text DEFAULT 'Auto';
