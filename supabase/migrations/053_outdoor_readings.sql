-- Outdoor temperature/humidity from the Govee H5107 (LoRa -> H5043 gateway ->
-- Govee cloud -- this sensor has no direct BLE path, unlike the indoor ones, so
-- it's polled via Govee's Developer API instead of read locally on the Pi).
--
-- RLS: both anon AND authenticated from the start. ac_goal_schedule/
-- ac_thermal_model/ac_controller_state/power_readings/lighting_schedule were all
-- shipped anon-only and silently broke for a signed-in session until migration
-- 052 caught up -- not repeating that here.

CREATE TABLE IF NOT EXISTS public.outdoor_readings (
  at        timestamptz NOT NULL DEFAULT now(),
  temp_f    numeric,
  humidity  numeric
);

CREATE INDEX IF NOT EXISTS outdoor_readings_at_idx ON public.outdoor_readings (at DESC);

ALTER TABLE public.outdoor_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_read_outdoor_readings"
  ON outdoor_readings FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_write_outdoor_readings"
  ON outdoor_readings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_authenticated_read_outdoor_readings"
  ON outdoor_readings FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_write_outdoor_readings"
  ON outdoor_readings FOR ALL TO authenticated USING (true) WITH CHECK (true);
