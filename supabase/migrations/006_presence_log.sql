-- Presence log — "am I home?" events for the AC schedule advisor.
--
-- Luke's PC isn't always on, so it can't be the presence sensor. His phone is.
-- An always-on Android automation (Tasker / HTTP Request Shortcuts) fires an
-- HTTP POST straight to Supabase REST on geofence enter/leave, writing one row
-- here each time. Over a couple of weeks this becomes an occupancy pattern the
-- advisor turns into "home weekday evenings, away 9-5" — which is what shapes
-- the AC schedule recommendations.
--
-- The phone uses the anon key directly; that's fine under this app's permissive
-- single-user RLS model (same as the other tables).

CREATE TABLE IF NOT EXISTS presence_log (
  id      bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts      timestamptz NOT NULL DEFAULT now(),
  present boolean     NOT NULL,            -- true = arrived home, false = left
  source  text                            -- e.g. 'phone-geofence'
);

CREATE INDEX IF NOT EXISTS presence_log_ts_idx ON presence_log (ts DESC);

ALTER TABLE presence_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_read_presence_log"
  ON presence_log FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_write_presence_log"
  ON presence_log FOR INSERT TO anon WITH CHECK (true);
