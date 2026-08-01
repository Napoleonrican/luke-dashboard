-- ─────────────────────────────────────────────────────────────────────────────
-- 049 — Vehicle Maintenance & Fuel Tracking tables
-- ─────────────────────────────────────────────────────────────────────────────
-- Ports "Vehicle Maintenance & Fuel Usage.xlsx" onto the dashboard, laid out
-- like the Cashflow module. Follows the same owner-scoped RLS pattern as
-- 017_financial_tables.sql / 016_financial_rls_template.sql.
--
-- Security:
--   • RLS ON for every table.
--   • Access restricted to the authenticated owner (auth.uid() = owner).
--   • No anon grants.
--
-- update_updated_at() is defined in 009_ai_backlog.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Vehicles (the CX-5 / Versa toggle) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS veh_vehicles (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner                 uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name                  text        NOT NULL,          -- "CX-5", "Versa"
  make                  text,
  model                 text,
  model_year            int,
  nickname              text,
  color                 text,                          -- hex, drives the toggle/accent
  active                boolean     NOT NULL DEFAULT true,
  miles_per_day_override numeric,                       -- overrides the computed milesPerDay
  sort_order            int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── Fuel fill-up log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS veh_fuel_logs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner           uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  vehicle_id      uuid        NOT NULL REFERENCES veh_vehicles (id) ON DELETE CASCADE,
  fill_date       date        NOT NULL,
  odometer        numeric     NOT NULL,
  gallons         numeric     NOT NULL,
  total_cost      numeric     NOT NULL DEFAULT 0,
  price_per_gallon numeric    GENERATED ALWAYS AS (total_cost / NULLIF(gallons, 0)) STORED,
  partial_fill    boolean     NOT NULL DEFAULT false,
  notes           text,
  sort_order      int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veh_fuel_logs_vehicle_date_idx ON veh_fuel_logs (vehicle_id, fill_date DESC);

-- ── Completed service visits (one row per shop visit) ────────────────────────
CREATE TABLE IF NOT EXISTS veh_service_visits (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner        uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  vehicle_id   uuid        NOT NULL REFERENCES veh_vehicles (id) ON DELETE CASCADE,
  service_date date        NOT NULL,
  odometer     numeric,
  summary      text,                                    -- one-liner, e.g. "Oil change, brake pads"
  total_cost   numeric     NOT NULL DEFAULT 0,           -- sum of items; recomputed client-side
  shop         text,
  is_diy       boolean     NOT NULL DEFAULT false,
  notes        text,
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veh_service_visits_vehicle_date_idx ON veh_service_visits (vehicle_id, service_date DESC);

-- ── Line items within a visit ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS veh_service_items (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner        uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  visit_id     uuid        NOT NULL REFERENCES veh_service_visits (id) ON DELETE CASCADE,
  service_type text        NOT NULL,
  cost         numeric     NOT NULL DEFAULT 0,
  notes        text,
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veh_service_items_visit_idx ON veh_service_items (visit_id);

-- ── Recurring maintenance schedule (the "Upcoming" tab) ───────────────────────
CREATE TABLE IF NOT EXISTS veh_service_plan (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner               uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  vehicle_id          uuid        NOT NULL REFERENCES veh_vehicles (id) ON DELETE CASCADE,
  service             text        NOT NULL,
  interval_months     int,
  interval_miles      int,
  avg_cost            numeric,
  last_completed_date date,
  last_odometer       numeric,
  enabled             boolean     NOT NULL DEFAULT true,
  notes               text,
  sort_order          int         NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veh_service_plan_vehicle_idx ON veh_service_plan (vehicle_id);

-- ── RLS: owner-only, authenticated-only, for every table ─────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'veh_vehicles', 'veh_fuel_logs', 'veh_service_visits',
    'veh_service_items', 'veh_service_plan'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY "Owner select" ON %1$I FOR SELECT TO authenticated USING (auth.uid() = owner);
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "Owner insert" ON %1$I FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "Owner update" ON %1$I FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "Owner delete" ON %1$I FOR DELETE TO authenticated USING (auth.uid() = owner);
    $f$, t);
    EXECUTE format('CREATE TRIGGER %1$I_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION update_updated_at();', t);
  END LOOP;
END $$;
