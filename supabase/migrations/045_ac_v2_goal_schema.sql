-- AC v2 Phase 1 — goal-only schedule, thermal model, controller state.
--
-- Additive only. ac_schedule, schedule_executor.py, and goal_follower.py are all
-- UNTOUCHED and keep driving the AC exactly as before — nothing reads these new
-- tables yet. This is purely schema + a derived, read-only mirror of the current
-- schedule, so Phase 2 (shadow-mode controller) has real tables to write decisions
-- into without risking the live system. See ac-schedule-agent/V2-REDESIGN.md §2, §7.

-- ---------------------------------------------------------------------------
-- 2.1 ac_goal_schedule — replaces the BASELINE half of ac_schedule.
-- No temp_f/mode/fan columns: the v2 controller computes device state from the
-- goal + thermal model. This is what permanently deletes the "baseline fights its
-- own goal" bug class (the 5:30 PM away block pushing a daytime-strength baseline
-- against a drift-up goal — see AGENT.md's BASELINE vs GOAL DIRECTION check, which
-- exists only because v1 needs a baseline at all).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ac_goal_schedule (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  position     int         NOT NULL,
  days         smallint    NOT NULL,                 -- 7-bit mask, bit0 = Sun (same as ac_schedule)
  time_local   time        NOT NULL,
  phase        text        NOT NULL CHECK (phase IN ('sleep', 'precool', 'home', 'away', 'off')),
  goal_room    text        CHECK (goal_room IN ('bedroom', 'living')),
  goal_temp_f  numeric,
  deadband_f   numeric     NOT NULL DEFAULT 2.0,      -- half-width; 2.5-3.0 for sleep
  quiet        boolean     NOT NULL DEFAULT false,    -- true = no fan bumps, no Turbo
  enabled      boolean     NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------------
-- 2.2 ac_thermal_model — single row (id=1). Seeded once by seed_thermal_model.py
-- from live sensor history + the live schedule (NOT thermal_analysis.py's stale
-- hardcoded SCHEDULE constant); refined afterward by the controller's own slow
-- EMA during quiet at-goal periods (no LLM in this path — it's arithmetic).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ac_thermal_model (
  id                 int         PRIMARY KEY DEFAULT 1,
  cool_rate_f_hr     numeric,             -- seed 0.36
  warm_rate_f_hr     jsonb,               -- re-warm rate keyed by outdoor-indoor delta bucket;
                                           -- starts empty, the controller builds this up live
  setpoint_offsets   jsonb,               -- {"64": 68, "69": 69, "75": 72, ...} setpoint->actual
  gap_by_hour        jsonb,               -- {"0": 4.2, "1": 3.9, ...} living-bedroom gap by hour
  eco_hold_ceiling_f numeric,             -- warmest Eco has been observed to hold the bedroom
  updated_at         timestamptz,
  CONSTRAINT ac_thermal_model_single_row CHECK (id = 1)
);

-- ---------------------------------------------------------------------------
-- 2.3 ac_controller_state — single row (id=1). Replaces .goal_follower_state.json
-- (a file on the Pi) with a Supabase row, so the dashboard can show "what the
-- controller thinks" live and shadow-mode comparison (Phase 2) is trivial.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ac_controller_state (
  id               int         PRIMARY KEY DEFAULT 1,
  active_block_id  bigint,
  plan             jsonb,               -- what was applied at block start + why
  settle_until     timestamptz,         -- no corrective writes before this
  latched_off      boolean     NOT NULL DEFAULT false,
  connects_today   int         NOT NULL DEFAULT 0,
  connects_date    date,
  last_write       jsonb,
  updated_at       timestamptz,
  CONSTRAINT ac_controller_state_single_row CHECK (id = 1)
);

-- RLS: same permissive anon policy pattern as every other ac_* table.
ALTER TABLE public.ac_goal_schedule    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ac_thermal_model    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ac_controller_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ac_goal_schedule' AND policyname='anon_all_ac_goal_schedule') THEN
    EXECUTE 'CREATE POLICY anon_all_ac_goal_schedule ON public.ac_goal_schedule FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ac_thermal_model' AND policyname='anon_all_ac_thermal_model') THEN
    EXECUTE 'CREATE POLICY anon_all_ac_thermal_model ON public.ac_thermal_model FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ac_controller_state' AND policyname='anon_all_ac_controller_state') THEN
    EXECUTE 'CREATE POLICY anon_all_ac_controller_state ON public.ac_controller_state FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Derive ac_goal_schedule from the CURRENT live ac_schedule (read-only source;
-- ac_schedule itself is untouched). Maps each block's clock time to a phase per
-- the mapping worked out in V2-REDESIGN.md §7 Phase 1 (today's schedule: 01:00
-- sleep, 08:30 home, 17:30 away, 18:30 home, 22:00 precool).
--
-- This is a snapshot at migration time, not a live sync — if the schedule changes
-- before Phase 2 goes live, re-run this INSERT block (it's idempotent: it clears
-- and re-derives every time) or edit ac_goal_schedule by hand. It only reads
-- goal_room/goal_temp_f/time_local/days/position/action from ac_schedule; the
-- baseline temp_f/mode/fan columns are deliberately left behind — that's the
-- whole point of this table.
-- ---------------------------------------------------------------------------
TRUNCATE public.ac_goal_schedule;

INSERT INTO public.ac_goal_schedule (position, days, time_local, phase, goal_room, goal_temp_f, deadband_f, quiet, enabled)
SELECT
  s.position,
  s.days,
  s.time_local,
  CASE
    WHEN s.action = 'off' THEN 'off'
    -- 00:00 and 01:00 are both overnight sleep blocks: same goal (bedroom 68),
    -- Luke is asleep, so they take the quiet gentle-hold sleep template (not a
    -- noisy precool/Turbo push at midnight). The 00:00 block was added to
    -- ac_schedule after this mapping was first written; it previously fell
    -- through to the 'home' default (see 046_fix_ac_goal_schedule_midnight_phase).
    WHEN s.time_local IN ('00:00:00', '01:00:00') THEN 'sleep'
    WHEN s.time_local = '08:30:00' THEN 'home'
    WHEN s.time_local = '17:30:00' THEN 'away'
    WHEN s.time_local = '18:30:00' THEN 'home'
    WHEN s.time_local = '22:00:00' THEN 'precool'
    -- Any block at a clock time not in the mapping above (schedule changed since
    -- this migration was written) falls back to 'home' as the least-surprising
    -- default -- NOT a guess to leave silent. Re-check phase assignment by hand
    -- for any row that lands here.
    ELSE 'home'
  END AS phase,
  CASE WHEN s.goal_room = 'living_room' THEN 'living' ELSE s.goal_room END AS goal_room,
  s.goal_temp_f,
  CASE WHEN s.time_local IN ('00:00:00', '01:00:00') THEN 2.5 ELSE 2.0 END AS deadband_f,
  (s.time_local IN ('00:00:00', '01:00:00')) AS quiet,
  s.enabled
FROM public.ac_schedule s;
