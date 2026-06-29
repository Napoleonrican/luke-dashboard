-- Lighting — Govee H6195 simple on/off timer slots (the strip's 4 native timers).
--
-- Separate from lighting_schedule (wake sunrise + bedtime sunset). These are the
-- 4 plain "turn on / turn off at HH:MM on these days" slots the Govee app exposes,
-- which map to the reverse-engineered command 0x33 0x23:
--   frame = 33 23 [slot] [flag] [hour] [minute] [days]
--   flag  = bit7 enabled (0x80) | bit0 action (1=on, 0=off)
--   days  = 0x00 every day | 0x80 do-not-repeat | 0x80|mask (bit0=Mon…bit6=Sun)
--
-- The Pi schedule controller writes each row into the strip's flash over BLE, so
-- the timers run on the strip itself even if the Pi is offline. The Pi's daily
-- time-sync keeps them from drifting.
--
-- DB convention (matches the wake_days day picker, bit0=Sun):
--   days = 127 → every day, 0 → do not repeat, otherwise the selected-day mask.
-- strip_proto.timer_frame() translates this to the firmware encoding.

CREATE TABLE IF NOT EXISTS lighting_timers (
  slot       smallint    PRIMARY KEY,                 -- 0..3
  enabled    boolean     NOT NULL DEFAULT false,
  turn_on    boolean     NOT NULL DEFAULT false,       -- true = turn on, false = turn off
  hour       smallint    NOT NULL DEFAULT 0,           -- 0..23
  minute     smallint    NOT NULL DEFAULT 0,           -- 0..59 (device snaps to /5)
  days       smallint    NOT NULL DEFAULT 127,         -- bit0=Sun…bit6=Sat; 127=every day, 0=once
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS — permissive single-user policies (mirror lighting_schedule / strip_state).
ALTER TABLE lighting_timers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_read_lighting_timers"
  ON lighting_timers FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_write_lighting_timers"
  ON lighting_timers FOR ALL TO anon USING (true) WITH CHECK (true);

-- Seed the 4 slots, all disabled.
INSERT INTO lighting_timers (slot) VALUES (0), (1), (2), (3)
  ON CONFLICT (slot) DO NOTHING;

-- Realtime so the Pi controller reacts instantly to edits.
ALTER PUBLICATION supabase_realtime ADD TABLE lighting_timers;
