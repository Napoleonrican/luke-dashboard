-- Add wake_days bitmask to lighting_schedule.
--
-- Byte[4] in the Govee H6195 wake frame (0x33 0x12) is a day-of-week bitmask:
--   bit0=Sun  bit1=Mon  bit2=Tue  bit3=Wed  bit4=Thu  bit5=Fri  bit6=Sat
-- 127 (0x7F, all bits set) = every day. 0 = alarm never fires.
-- Default 127 preserves existing "daily" behaviour for existing rows.

ALTER TABLE lighting_schedule
  ADD COLUMN IF NOT EXISTS wake_days smallint NOT NULL DEFAULT 127;
