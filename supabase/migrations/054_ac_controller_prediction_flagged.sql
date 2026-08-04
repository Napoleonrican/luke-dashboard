-- AC v2 — new ac_controller_state column for the latched_prediction_wrong anomaly
-- (V2-REDESIGN.md §3.4 / §5). should_skip() latches the AC off for a whole block on
-- a positive prediction; if that prediction turns out wrong (room drifts past goal
-- while latched), controller.py now flags it once per block rather than staying
-- silent until the next boundary. `prediction_flagged` is the once-per-block guard
-- that keeps that flag from writing a new ac_change_log row every 5-minute tick for
-- the rest of a blown afternoon.
--
-- Per the STATE_COLUMNS allowlist warning in controller.py: a state field added
-- without a matching column here doesn't crash, but PostgREST would silently drop
-- it from every write, so the flag would never persist and would fire every tick
-- instead of once. This migration is that matching column.

ALTER TABLE public.ac_controller_state
  ADD COLUMN IF NOT EXISTS prediction_flagged boolean NOT NULL DEFAULT false;
