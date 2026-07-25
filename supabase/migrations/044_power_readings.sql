-- AC v2 Phase 0 — Shelly Plus Plug US power telemetry.
--
-- The Shelly plug the AC is plugged into is a SENSOR ONLY in this design — we never
-- actuate its relay (hard-cutting a running compressor is mechanically bad, and the
-- GE won't restart into a known state). This table is the raw feed that later phases
-- build on:
--   * write verification without spending a GE WiFi connect (v2 §6.1 A)
--   * free-cooling proof — "outdoors is doing the work" vs "the compressor is" (§6.1 B)
--   * anomaly detection: overnight cycling, plan mismatch, unit-dark (§6.1 C)
--   * real kWh as the efficiency ground truth, replacing connect-count proxies (§6.1 D)
--
-- Phase 0 only WRITES this table (shelly_poller.py, every 60s). Nothing reads it yet
-- and no control behavior changes.

CREATE TABLE IF NOT EXISTS public.power_readings (
  id        bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  watts     numeric     NOT NULL,
  wh_total  numeric
);

-- Every consumer of this table is a time-window scan (last N minutes for the write
-- verifier, an overnight window for the cycling query, a day for kWh totals).
CREATE INDEX IF NOT EXISTS power_readings_at_idx ON public.power_readings (at DESC);

ALTER TABLE public.power_readings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'power_readings'
      AND policyname  = 'anon_all_power_readings'
  ) THEN
    EXECUTE 'CREATE POLICY anon_all_power_readings ON public.power_readings
             FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- Retention note: at a 60s cadence this is ~1,440 rows/day (~525k/year). Fine for
-- Postgres as-is, but the minute-level detail stops being useful once a day is past
-- (the anomaly queries all run against recent windows, and kWh totals come from the
-- wh_total counter, not from summing samples). If it ever needs trimming, deleting
-- rows older than ~90 days is safe and loses nothing the rest of the system uses.
