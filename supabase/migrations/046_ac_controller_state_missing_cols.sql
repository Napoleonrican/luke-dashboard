-- AC v2 — the columns controller.py has been trying to write since Phase 2 shipped.
--
-- Migration 045 created ac_controller_state with 9 columns, but controller.py's
-- save_state() writes 15 keys. PostgREST rejects an ENTIRE write with a 400 when it
-- sees one unknown column, so save_state() failed on EVERY tick and the controller
-- persisted no state at all. Consequences, all observed in the shadow log on
-- 2026-07-29:
--   * active_block_id never persisted, so every 5-minute tick re-read as a fresh
--     block boundary and re-planned. `block_plan` rows every 5 minutes (06:56,
--     07:01, 07:06, 07:11, 07:21, 07:26 ...) instead of one per block.
--   * connects_today reset to 0 each tick, so DAILY_CONNECT_CAP could never
--     restrain anything — the budget could not count.
--   * latched_off and settle_until never stuck, so skip decisions and settle
--     windows evaporated; the log alternated Eco / "AC OFF (block skipped)".
--   * the steady-state and observe() branches were never reached at all, which is
--     why ac_thermal_model.warm_rate_f_hr stayed {} and its updated_at never moved
--     past the Phase 1 seed.
-- In live mode this would have written to the AC every 5 minutes all night — the
-- 2026-07-24 overnight cycling failure, reproduced via an entirely different root
-- cause. Shadow mode caught it first, which is what shadow mode is for.
--
-- Additive and idempotent. controller.py also now filters its payload through an
-- explicit STATE_COLUMNS allowlist and logs a loud error (plus a state_save_failed
-- row in ac_change_log) rather than failing silently, so a future field added
-- without a migration degrades instead of destroying all persistence.

ALTER TABLE public.ac_controller_state
  -- corrections spent inside the current block (CORRECTIONS_PER_BLOCK_MAX)
  ADD COLUMN IF NOT EXISTS corrections_used  int         NOT NULL DEFAULT 0,
  -- when the goal room first left the deadband (drives the SUSTAIN_MINUTES gate)
  ADD COLUMN IF NOT EXISTS outside_since     timestamptz,
  -- last {temp, at} sample used to derive warm_rate_f_hr by outdoor-delta bucket
  ADD COLUMN IF NOT EXISTS warm_obs          jsonb,
  -- surge response (V2-REDESIGN.md §4a): sustain timer, in-surge flag, and the
  -- separate hard-walled daily reserve that never mixes with connects_today
  ADD COLUMN IF NOT EXISTS surge_since       timestamptz,
  ADD COLUMN IF NOT EXISTS surge_active      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surge_used_today  int         NOT NULL DEFAULT 0;

-- Clear the stale single row so the controller starts from a clean, coherent state
-- rather than inheriting fields written before persistence worked.
UPDATE public.ac_controller_state
   SET active_block_id  = NULL,
       plan             = NULL,
       settle_until     = NULL,
       latched_off      = false,
       connects_today   = 0,
       connects_date    = NULL,
       corrections_used = 0,
       outside_since    = NULL,
       surge_since      = NULL,
       surge_active     = false,
       surge_used_today = 0,
       updated_at       = now()
 WHERE id = 1;
