import FinancialAuthGate from './FinancialAuthGate';
import SetPasswordGate from './SetPasswordGate';

// Auth gate for the Gig Ops Mission Control page. Unlike FinancialAuthGate's
// other callers, this one does NOT set `requireOwner` — any real signed-in
// account (Luke's, or the collaborator's own separate login) unlocks it. The
// actual data boundary (she only ever sees gig-tracker rows) is enforced by
// RLS on the mc_* tables, not by this gate — see
// supabase/migrations/047_gig_ops_scope.sql.
//
// SetPasswordGate sits inside: an invited collaborator arrives with a valid
// session but no password of her own, and picks one before the page renders.
export default function GigOpsAuthGate({ children }) {
  return (
    <FinancialAuthGate
      title="Gig Tracker — Mission Control"
      subtitle="Sign in with your Gig Ops account"
      allowPasswordSetup
    >
      <SetPasswordGate>{children}</SetPasswordGate>
    </FinancialAuthGate>
  );
}
