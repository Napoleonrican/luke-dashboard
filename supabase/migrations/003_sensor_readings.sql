-- Govee H5100 thermometer logging
-- A local Python collector (see "Govee Thermometers" project) listens for the
-- sensors' Bluetooth broadcasts and inserts a row into sensor_readings each time.
-- The dashboard's Thermometers page reads from both tables.

-- Registry of known sensors. mac is the Bluetooth address; label is the friendly
-- name shown on the dashboard (e.g. "Living Room"). The collector upserts a row
-- here the first time it sees a sensor; you can rename label anytime.
CREATE TABLE IF NOT EXISTS sensors (
  mac         text        PRIMARY KEY,
  name        text,                                  -- BLE local name, e.g. GVH5100_7180
  label       text,                                  -- friendly name, e.g. "Living Room"
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per broadcast reading.
CREATE TABLE IF NOT EXISTS sensor_readings (
  id        bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mac       text        NOT NULL,
  ts        timestamptz NOT NULL DEFAULT now(),
  temp_c    numeric(5,2),
  humidity  numeric(5,2),
  battery   smallint,
  rssi      smallint
);

-- Fast "latest reading per sensor" and time-range chart queries.
CREATE INDEX IF NOT EXISTS sensor_readings_mac_ts_idx
  ON sensor_readings (mac, ts DESC);

-- RLS — single-user personal app, mirrors the permissive policy used by the
-- other tables in this project.
ALTER TABLE sensors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_read_sensors"
  ON sensors FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_write_sensors"
  ON sensors FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "allow_anon_read_sensor_readings"
  ON sensor_readings FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_write_sensor_readings"
  ON sensor_readings FOR ALL TO anon USING (true) WITH CHECK (true);
