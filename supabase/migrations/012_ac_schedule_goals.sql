-- Per-block goal fields for the Layer-2 goal-follower.
--
-- Each schedule block already carries its BASELINE (temp_f / mode / fan) that the
-- schedule executor applies at the block's start. These optional columns add a
-- GOAL: a target room + temperature the goal-follower drives toward *within* the
-- block, escalating (setpoint → fan → mode) until the goal is met or the next
-- block fires. A block with no goal behaves exactly as before (baseline only).

ALTER TABLE public.ac_schedule
  ADD COLUMN IF NOT EXISTS goal_room   text,
  ADD COLUMN IF NOT EXISTS goal_temp_f numeric(4,1);

-- Constrain goal_room to the two known sensors (nullable = no goal for the block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ac_schedule_goal_room_check'
  ) THEN
    ALTER TABLE public.ac_schedule
      ADD CONSTRAINT ac_schedule_goal_room_check
      CHECK (goal_room IS NULL OR goal_room IN ('bedroom', 'living_room'));
  END IF;
END$$;
