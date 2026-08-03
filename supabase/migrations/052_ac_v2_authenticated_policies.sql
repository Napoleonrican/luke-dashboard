-- Fix: several tables created AFTER migration 028 (which fixed this exact
-- problem for everything that existed at the time) were only ever given `anon`
-- RLS policies. As soon as Luke is signed in for the financial modules
-- (Cashflow / Debt Calculator), every request elevates to the `authenticated`
-- role -- and with no matching policy, RLS silently returns zero rows. That's
-- what made the Goal Schedule page "disappear" after logging in: not caching,
-- not data loss, not an app bug -- ac_goal_schedule (and ac_thermal_model,
-- ac_controller_state, power_readings) simply had no authenticated-role grant.
-- lighting_schedule (migration 030) has the identical gap and would silently
-- break the Lighting Schedule tab the same way -- fixed here too rather than
-- waiting to rediscover it separately.
--
-- Mirrors migration 028's pattern exactly onto every table it predates.

-- ac_goal_schedule
CREATE POLICY "allow_authenticated_read_ac_goal_schedule"
  ON ac_goal_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_ac_goal_schedule"
  ON ac_goal_schedule FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ac_thermal_model
CREATE POLICY "allow_authenticated_read_ac_thermal_model"
  ON ac_thermal_model FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_ac_thermal_model"
  ON ac_thermal_model FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ac_controller_state
CREATE POLICY "allow_authenticated_read_ac_controller_state"
  ON ac_controller_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_ac_controller_state"
  ON ac_controller_state FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- power_readings
CREATE POLICY "allow_authenticated_read_power_readings"
  ON power_readings FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_power_readings"
  ON power_readings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lighting_schedule
CREATE POLICY "allow_authenticated_read_lighting_schedule"
  ON lighting_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_lighting_schedule"
  ON lighting_schedule FOR ALL TO authenticated USING (true) WITH CHECK (true);
