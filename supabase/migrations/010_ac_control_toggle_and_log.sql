-- AC control safety layer: a master on/off switch + an audit log.
--
-- executor_enabled gates the schedule executor entirely. Default FALSE so the
-- executor does NOTHING until Luke explicitly flips it on from the dashboard —
-- a hard kill-switch and the prerequisite for letting an agent touch the AC.

ALTER TABLE ac_preferences
  ADD COLUMN IF NOT EXISTS executor_enabled boolean NOT NULL DEFAULT false;

-- Every change to the AC / schedule, from any source, lands here so it's
-- visible and reversible on the dashboard.
CREATE TABLE IF NOT EXISTS ac_change_log (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts      timestamptz NOT NULL DEFAULT now(),
  source  text NOT NULL,          -- 'executor' | 'agent' | 'manual'
  action  text,                   -- short verb, e.g. 'applied', 'edited', 'experiment'
  detail  text,                   -- human-readable what happened
  reason  text,                   -- why (the agent fills this in)
  meta    jsonb                   -- optional structured payload
);
CREATE INDEX IF NOT EXISTS ac_change_log_ts_idx ON ac_change_log (ts DESC);

ALTER TABLE ac_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_change_log"  ON ac_change_log FOR SELECT TO anon USING (true);
CREATE POLICY "anon_write_change_log" ON ac_change_log FOR INSERT TO anon WITH CHECK (true);
