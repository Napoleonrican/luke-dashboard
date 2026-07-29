// Single source of truth for "which signed-in account is Luke." This is a
// two-person app (Luke + one collaborator with her own Supabase Auth login),
// so a full roles table would be overkill — this mirrors the existing
// hardcoded-single-user style already used by ProtectedRoute's password.
// Used to keep financial modules (Cashflow, Debt Calculator, Watch Tracker,
// the general Mission Control) restricted to Luke's account even though the
// collaborator has a real, valid Supabase Auth session of her own.
export const OWNER_EMAIL = 'napoleonrican08@gmail.com';
