-- AC schedule advisor — schedule, preferences, and recommendations.
--
-- GE stores SmartHQ schedules in its cloud with no public read API, so we keep a
-- hand-maintained mirror of Luke's schedule here. The "Current AC Schedule" card
-- on the dashboard lets him enter the entries he set in the SmartHQ app; the
-- advisor (api/schedule-advisor) reads this as the baseline it recommends changes
-- against. He applies any accepted changes manually back in the SmartHQ app.

-- ── Current schedule (mirrors the SmartHQ app entries) ─────────────────────
-- days is a 7-bit weekday mask: bit 0 = Sunday ... bit 6 = Saturday; 127 = every day.
CREATE TABLE IF NOT EXISTS ac_schedule (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  position    smallint    NOT NULL DEFAULT 0,
  days        smallint    NOT NULL DEFAULT 127,
  time_local  time        NOT NULL DEFAULT '00:00',
  action      text        NOT NULL DEFAULT 'on',    -- 'on' | 'off'
  temp_f      smallint,
  mode        text,                                 -- 'Cool'|'Eco'|'Energy Saver'|'Turbo Cool'|'Dry'
  enabled     boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ac_schedule_position_idx ON ac_schedule (position, time_local);

-- ── Preferences (single row; balanced defaults) ────────────────────────────
CREATE TABLE IF NOT EXISTS ac_preferences (
  id              smallint    PRIMARY KEY DEFAULT 1,
  priority        text        NOT NULL DEFAULT 'balanced',  -- 'comfort'|'balanced'|'energy'
  comfort_low_f   smallint    NOT NULL DEFAULT 69,
  comfort_high_f  smallint    NOT NULL DEFAULT 74,
  quiet_start     smallint    NOT NULL DEFAULT 0,           -- no-AC window start hour (beeping disabled; primarily for respecting sleep schedule)
  quiet_end       smallint    NOT NULL DEFAULT 6,           -- no-AC window end hour (beeping disabled; primarily for respecting sleep schedule)
  room_sensor_mac text,                                     -- Govee sensor in the AC's room
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Latest advisor output ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_recommendations (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  generated_at timestamptz NOT NULL DEFAULT now(),
  summary      text,                                 -- short prose overview
  changes      jsonb,                                -- structured diff (entry_id refs ac_schedule.id)
  rationale    text                                  -- longer reasoning
);
CREATE INDEX IF NOT EXISTS schedule_recommendations_gen_idx
  ON schedule_recommendations (generated_at DESC);

-- ── RLS — permissive single-user policies (mirror the other tables) ────────
ALTER TABLE ac_schedule             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ac_preferences          ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_read_ac_schedule"
  ON ac_schedule FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_write_ac_schedule"
  ON ac_schedule FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "allow_anon_read_ac_preferences"
  ON ac_preferences FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_write_ac_preferences"
  ON ac_preferences FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "allow_anon_read_schedule_recommendations"
  ON schedule_recommendations FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_write_schedule_recommendations"
  ON schedule_recommendations FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── Seed: Luke's current 4 schedule entries (from the SmartHQ app) ─────────
-- Every day (127). Modes per the screenshot.
INSERT INTO ac_schedule (position, days, time_local, action, temp_f, mode)
VALUES
  (1, 127, '00:00', 'on', 64, 'Cool'),
  (2, 127, '01:00', 'on', 64, 'Eco'),
  (3, 127, '10:00', 'on', 69, 'Eco'),
  (4, 127, '17:30', 'on', 75, 'Eco')
ON CONFLICT DO NOTHING;

-- ── Seed: one balanced preferences row ─────────────────────────────────────
INSERT INTO ac_preferences (id, priority)
VALUES (1, 'balanced')
ON CONFLICT (id) DO NOTHING;
