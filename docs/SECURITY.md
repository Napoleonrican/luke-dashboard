# Security — Financial modules

The financial modules (Cashflow Plan, and anything handling balances, debts, or
account data) use **real server-side authentication**, not the display-only
privacy blur or the hardcoded-password `ProtectedRoute` used elsewhere.

## Two layers of defense

1. **Auth gate (frontend)** — `src/components/FinancialAuthGate.jsx` wraps the
   `/cashflow` route. It requires a valid Supabase session before rendering, so
   financial UI is never shown to an unauthenticated visitor.
2. **Row-Level Security (backend)** — every financial table is scoped to
   `auth.uid() = owner` and grants access only to the `authenticated` role.
   Even someone holding the public anon key (it ships in the JS bundle) cannot
   read these tables. See `supabase/migrations/016_financial_rls_template.sql`.

The rest of the dashboard (climate, lighting, gig tracker, the Pi's tables) is
**untouched** — those tables stay public-access and the Pi keeps working exactly
as before. Auth is additive and scoped only to financial data.

## One-time Supabase setup

In the Supabase dashboard:

1. **Authentication → Providers → Email** — enable.
2. **Authentication → Sign-ups** — **disable** (you create your own user; no one
   can self-register).
3. **Authentication → Users → Add user** — create your single login with email +
   password. Copy the user's **UID**.
4. When we create the financial tables (Tier 0), their `owner` column defaults to
   `auth.uid()`, so rows you create are automatically scoped to you.

## Using it

- Visit `/cashflow` → sign in once with email + password.
- The session persists per device (auto-refreshed), so you stay logged in.
- **Sign out** from the header button to lock it again on a shared device.

## What still needs hardening (tracked, not yet done)

- The legacy `ProtectedRoute` password (`Napoleon21!`) is still in the source for
  non-financial modules. Fine for now (those modules hold no sensitive data), but
  we should migrate them to Supabase auth too and remove the hardcoded string.
- Consider a local DB backup script (`scripts/backup-db.mjs`) so financial data
  isn't solely dependent on Supabase — planned for Tier 0.
