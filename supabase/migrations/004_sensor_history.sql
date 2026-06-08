-- Govee H5100 on-device history.
--
-- Separate from sensor_readings (which the live collector appends to). The
-- sensors store ~20 days of history internally at ~10-minute resolution. A local
-- script (history_pull.py) connects to each device over Bluetooth, downloads that
-- stored history, and UPSERTS it here. Because each (mac, ts) pair is unique, the
-- pull can run as often as you like without ever creating duplicates, and it never
-- erases anything on the device.
--
-- The dashboard graph + Excel export read from THIS table (gap-light, even when
-- the PC was off). The live tiles keep reading from sensor_readings.

CREATE TABLE IF NOT EXISTS sensor_history (
  mac       text        NOT NULL REFERENCES sensors(mac) ON DELETE CASCADE,
  ts        timestamptz NOT NULL,                  -- reading time (from the device's stored record)
  temp_c    numeric(5,2),
  humidity  numeric(5,2),
  battery   smallint,
  PRIMARY KEY (mac, ts)                            -- enables idempotent upsert (on_conflict mac,ts)
);

-- Fast time-range chart queries per sensor.
CREATE INDEX IF NOT EXISTS sensor_history_mac_ts_idx
  ON sensor_history (mac, ts DESC);

-- RLS — single-user personal app, mirrors the permissive policy used by the
-- other tables. (The local puller uses the service_role key and bypasses RLS;
-- the anon SELECT policy is what lets the dashboard read the graph.)
ALTER TABLE sensor_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_read_sensor_history"
  ON sensor_history FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_write_sensor_history"
  ON sensor_history FOR ALL TO anon USING (true) WITH CHECK (true);
