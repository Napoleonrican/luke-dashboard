-- ─────────────────────────────────────────────────────────────────────────────
-- 017 — Financial tables (canonical source of truth)
-- ─────────────────────────────────────────────────────────────────────────────
-- Replaces the Financial Workbook + Cashflow Plan sheets. Every number lives in
-- exactly one row here; the dashboard's views (All Bills & Debts rollup, Waterfall,
-- Short Term Needs) all derive from these tables — no duplication.
--
-- Security (see docs/SECURITY.md):
--   • RLS ON for every table.
--   • Access is restricted to the authenticated owner (auth.uid() = owner).
--   • The anon role is never granted access, so the public bundle key can't read
--     financial data. Unlike climate/ai_backlog, these are NOT public tables.
--
-- update_updated_at() is defined in 009_ai_backlog.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Accounts (Waterfall "Current Balances") ──────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_accounts (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner       uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name        text        NOT NULL,
  slug        text        NOT NULL,            -- stable key (billpay, operating, …)
  balance     numeric     NOT NULL DEFAULT 0,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Bills (recurring fixed/operating obligations) ────────────────────────────
CREATE TABLE IF NOT EXISTS fin_bills (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner         uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name          text        NOT NULL,
  amount        numeric     NOT NULL DEFAULT 0,  -- monthly amount
  category      text        NOT NULL DEFAULT 'Bill', -- Bill | Operating | …
  day_due       int,                              -- day of month (1–31), nullable
  next_due_date date,
  autopay       boolean     NOT NULL DEFAULT false,
  account       text,                             -- which account it debits
  notes         text,
  sort_order    int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Digital subscriptions (due-date driven, like bills) ──────────────────────
CREATE TABLE IF NOT EXISTS fin_digital_subscriptions (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner         uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name          text        NOT NULL,
  amount        numeric     NOT NULL DEFAULT 0,
  frequency     text        NOT NULL DEFAULT 'Monthly',
  next_due_date date,
  day_due       int,
  autopay       boolean     NOT NULL DEFAULT false,
  account       text,
  notes         text,
  sort_order    int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Consumable subscriptions (frequency → monthly average) ────────────────────
-- You enter cost-per-order + how often it ships; monthly_estimate is derived
-- automatically and feeds the Bill Pay Checking floor.
CREATE TABLE IF NOT EXISTS fin_consumable_subscriptions (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner               uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name                text        NOT NULL,
  cost_per_order      numeric     NOT NULL DEFAULT 0,
  order_frequency_days int        NOT NULL DEFAULT 30,
  monthly_estimate    numeric     GENERATED ALWAYS AS
                        (cost_per_order * 30.44 / NULLIF(order_frequency_days, 0)) STORED,
  notes               text,
  sort_order          int         NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Debts (canonical — every column editable) ────────────────────────────────
-- Day-to-day columns surface in the UI; the rest collapse into an "advanced"
-- group, mirroring how they're grouped/hidden in the workbook.
CREATE TABLE IF NOT EXISTS fin_debts (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner               uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  -- frequently used
  purchase            text        NOT NULL,     -- the debt name / purchase
  lender              text,
  balance             numeric     NOT NULL DEFAULT 0,
  normal_payment      numeric     NOT NULL DEFAULT 0,
  next_due_date       date,
  day_due             int,
  pending_withdrawal  numeric     NOT NULL DEFAULT 0,
  paydown_priority    int,
  payments_remaining  int,
  expected_payoff_date date,
  -- advanced / historical (collapsed group)
  credit_type         text,                     -- BNPL | Loan | Credit Card
  apr                 numeric,
  term_months         int,
  origination_date    date,
  finance_charge      numeric,
  credit_limit        numeric,
  notes               text,
  sort_order          int         NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Inputs / targets (the Cashflow "Inputs" sheet, as config) ────────────────
CREATE TABLE IF NOT EXISTS fin_inputs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner       uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  slug        text        NOT NULL,             -- stable key (billpay_floor, …)
  label       text        NOT NULL,
  value       numeric,
  unit        text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner, slug)
);

-- ── RLS: owner-only, authenticated-only, for every table ─────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fin_accounts', 'fin_bills', 'fin_digital_subscriptions',
    'fin_consumable_subscriptions', 'fin_debts', 'fin_inputs'
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
