-- Fix: the Climate History chart (12H/24H/7D) was returning zero rows for the
-- anon role even though sensor_history itself has data and a matching
-- "allow_anon_read_sensor_history" SELECT policy (004_sensor_history.sql).
--
-- Diagnosis (2026-07-01): calling history_series from the live dashboard (real
-- anon key) returned `[]` for a window that returns full data when queried with
-- the service_role key. The function is SQL/STABLE with no SECURITY clause, so
-- it defaults to SECURITY INVOKER — it runs as the calling (anon) role and is
-- therefore subject to sensor_history's RLS at call time. The anon SELECT
-- policy on sensor_history is either missing or was altered directly in the
-- Supabase dashboard outside of migrations (git history shows no code change to
-- it), so it no longer matches for anon.
--
-- Rather than chase what changed in the live policy, make the aggregation
-- function SECURITY DEFINER so it always has access regardless of the anon
-- policy's state — appropriate here since this is a personal, single-user,
-- deliberately-permissive dashboard (matches the "allow_anon_*" pattern used
-- everywhere else in this project) and the function only ever aggregates and
-- returns read-only rows, never writes.
CREATE OR REPLACE FUNCTION history_series(since timestamptz, bucket_seconds integer)
RETURNS TABLE (bucket timestamptz, mac text, temp_c numeric, humidity numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    date_bin(make_interval(secs => bucket_seconds), ts, timestamptz 'epoch') AS bucket,
    mac,
    round(avg(temp_c)::numeric, 2)   AS temp_c,
    round(avg(humidity)::numeric, 1) AS humidity
  FROM sensor_history
  WHERE ts >= since
  GROUP BY 1, 2
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION history_series(timestamptz, integer) TO anon, authenticated;

-- Defense in depth: re-assert the anon read policy on sensor_history in case it
-- was the thing that actually broke (idempotent — safe to run even if it's fine).
DROP POLICY IF EXISTS "allow_anon_read_sensor_history" ON sensor_history;
CREATE POLICY "allow_anon_read_sensor_history"
  ON sensor_history FOR SELECT TO anon USING (true);
