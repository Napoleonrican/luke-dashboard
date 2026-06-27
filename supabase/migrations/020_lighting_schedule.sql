-- Lighting — Govee H6195 onboard schedules (wake sunrise + bedtime sunset).
--
-- Single-row desired config. The dashboard's Lighting → Schedule page writes it;
-- the Pi schedule controller (in the climate agent) reads it and writes the
-- matching timers into the strip's own flash over BLE, so the STRIP runs the
-- fades itself — even if the Pi is offline. The Pi also pushes a daily time-sync
-- so the wake alarm never drifts (the Govee app used to do this; with the strip's
-- Wi-Fi dead and the app unusable, the Pi takes over).
--
-- Maps to reverse-engineered commands: wake = 0x33 0x12 (absolute daily alarm),
-- bedtime = 0x33 0x11 ("Sleeping" countdown, relative), sync = 0x33 0x09.

CREATE TABLE IF NOT EXISTS lighting_schedule (
  id              smallint    PRIMARY KEY DEFAULT 1,

  -- Wake up: sunrise fade reaching full at wake_hour:wake_minute, ramping over
  -- wake_fade_min beforehand. Absolute wall-clock (kept accurate by time-sync).
  wake_enabled    boolean     NOT NULL DEFAULT false,
  wake_hour       smallint    NOT NULL DEFAULT 7,    -- 0..23
  wake_minute     smallint    NOT NULL DEFAULT 0,    -- 0..59 (device snaps to /5)
  wake_fade_min   smallint    NOT NULL DEFAULT 15,   -- ramp length in minutes
  wake_brightness smallint    NOT NULL DEFAULT 100,  -- 1..100 target

  -- Bedtime ("Sleeping"): on-demand sunset. The dashboard bumps
  -- bedtime_trigger_at; the Pi arms the countdown + powers the strip on, and the
  -- strip dims itself to off over sleep_fade_min. Clock-free (relative to on).
  sleep_fade_min   smallint   NOT NULL DEFAULT 15,   -- dim length in minutes
  sleep_brightness smallint   NOT NULL DEFAULT 40,   -- 1..100 starting brightness
  bedtime_trigger_at timestamptz,                    -- bump to start bedtime now

  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS — permissive single-user policies (mirror strip_state / the AC tables).
-- The web app uses the anon key, so anon needs read + write.
ALTER TABLE lighting_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_read_lighting_schedule"
  ON lighting_schedule FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_write_lighting_schedule"
  ON lighting_schedule FOR ALL TO anon USING (true) WITH CHECK (true);

-- Seed the single config row.
INSERT INTO lighting_schedule (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Realtime so the Pi controller reacts instantly to edits + bedtime triggers.
ALTER PUBLICATION supabase_realtime ADD TABLE lighting_schedule;
