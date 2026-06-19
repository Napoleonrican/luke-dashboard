-- Lighting — Govee H6195 strip light state.
--
-- Single-row desired/live state. The dashboard's Lighting module writes to it and
-- the Pi strip agent (separate repo: govee-strip-agent) reads it and applies the
-- look over BLE — no Govee app, no cloud, no Wi-Fi on the strip. Same loose
-- Supabase coupling the AC system uses between the dashboard and its executor.

CREATE TABLE IF NOT EXISTS strip_state (
  id         smallint    PRIMARY KEY DEFAULT 1,
  power      boolean     NOT NULL DEFAULT false,
  brightness smallint    NOT NULL DEFAULT 100,   -- 1..100 (hardware dim)
  r          smallint    NOT NULL DEFAULT 255,   -- 0..255
  g          smallint    NOT NULL DEFAULT 160,
  b          smallint    NOT NULL DEFAULT 60,
  scene      text,                                -- key of the last-applied scene, if any
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS — permissive single-user policies (mirror the climate/AC tables). The web
-- app talks to Supabase with the anon key, so anon needs read+write here.
ALTER TABLE strip_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_read_strip_state"
  ON strip_state FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_write_strip_state"
  ON strip_state FOR ALL TO anon USING (true) WITH CHECK (true);

-- Seed the single state row (warm white, off).
INSERT INTO strip_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
