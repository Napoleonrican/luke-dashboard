-- Fix: non-financial tables were missing RLS policies for the `authenticated`
-- role. All policies were scoped to `anon` only, so as soon as the user signed
-- in for the financial modules (Cashflow / Debt Calculator), Supabase elevated
-- every request to the `authenticated` role and these tables returned zero rows
-- — causing the Climate/Lighting extras, the living-room temp chip, and the
-- AC-state label on the home page to silently disappear.
--
-- This migration mirrors the permissive pattern already used by ai_backlog_tasks
-- (which has always had both roles) onto every other non-financial table.

-- sensors
CREATE POLICY "allow_authenticated_read_sensors"
  ON sensors FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_sensors"
  ON sensors FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- sensor_readings
CREATE POLICY "allow_authenticated_read_sensor_readings"
  ON sensor_readings FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_sensor_readings"
  ON sensor_readings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- strip_state
CREATE POLICY "allow_authenticated_read_strip_state"
  ON strip_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_strip_state"
  ON strip_state FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ac_schedule
CREATE POLICY "allow_authenticated_read_ac_schedule"
  ON ac_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_ac_schedule"
  ON ac_schedule FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ac_preferences
CREATE POLICY "allow_authenticated_read_ac_preferences"
  ON ac_preferences FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_ac_preferences"
  ON ac_preferences FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- schedule_recommendations
CREATE POLICY "allow_authenticated_read_schedule_recommendations"
  ON schedule_recommendations FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_schedule_recommendations"
  ON schedule_recommendations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ac_comfort_mode
CREATE POLICY "authenticated_all_comfort_mode"
  ON public.ac_comfort_mode FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ac_change_log
CREATE POLICY "allow_authenticated_read_change_log"
  ON ac_change_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_change_log"
  ON ac_change_log FOR INSERT TO authenticated WITH CHECK (true);
