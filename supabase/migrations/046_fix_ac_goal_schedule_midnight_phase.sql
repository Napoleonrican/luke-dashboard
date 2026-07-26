-- Fix the ac_goal_schedule 00:00 block: it was mismapped to phase='home'.
--
-- Background (personal-assistant cc-review #151): migration 045 derives
-- ac_goal_schedule from the live ac_schedule via a hardcoded clock-time -> phase
-- CASE that only covered 5 of the 6 schedule blocks (01:00, 08:30, 17:30, 18:30,
-- 22:00). ac_schedule also has a block at 00:00 (temp_f=64, mode=Cool, fan=Auto,
-- goal_room=bedroom, goal_temp_f=68) that was added after 045's mapping was
-- written, so it fell through 045's `ELSE 'home'` default and landed as:
--
--   position=1, time_local=00:00:00, phase=home, deadband_f=2.0, quiet=false
--
-- That's wrong. The 00:00 block sits between the 22:00 precool blast and the
-- 01:00 sleep hold, carries an explicit bedroom/68 goal, and fires at midnight
-- while Luke is asleep. Per V2-REDESIGN.md section 4, an overnight quiet hold at
-- the bedroom goal is the `sleep` template (Eco/fan Low, deadband 2.5, quiet=true)
-- -- NOT `home`, and NOT the noisy `precool` "floor the setpoint / Turbo allowed"
-- template (precool is the pre-bed noise-is-free window, not a midnight push).
--
-- The Phase 2 shadow controller is already reading ac_goal_schedule (~5 min poll),
-- so this fixes the input to the shadow-vs-live comparison. Live AC behavior is
-- unaffected -- the shadow controller does not drive the unit yet.
--
-- Idempotent: safe to run more than once. Matches on the 00:00 block only.
-- 045's derive CASE has also been patched so a future TRUNCATE + re-derive
-- produces this same result without needing this migration again.

UPDATE public.ac_goal_schedule
SET phase      = 'sleep',
    deadband_f = 2.5,
    quiet      = true
WHERE time_local = '00:00:00'
  AND phase = 'home';
