// Identity config for the dashboard. This is a two-person app (Luke + one
// collaborator with her own Supabase Auth login), so a roles table would be
// overkill — this mirrors the existing hardcoded-single-user style already
// used by ProtectedRoute's password.

// Used to keep financial modules (Cashflow, Debt Calculator, Watch Tracker,
// the general Mission Control) restricted to Luke's account even though the
// collaborator has a real, valid Supabase Auth session of her own.
// NOTE: supabase/migrations/047_gig_ops_scope.sql hardcodes this same address
// in its RLS policies — change both together.
export const OWNER_EMAIL = 'napoleonrican08@gmail.com';

// `mc_messages.author` is free text. These are the three values that appear:
// 'luke' (his own Mission Control), 'collab' (the Gig Ops page), and
// 'sidekick' (the routine). COLLAB_AUTHOR is also referenced by the Sidekick
// routine prompt — see docs/sidekick-gig-ops-patch.md.
export const OWNER_AUTHOR = 'luke';
export const COLLAB_AUTHOR = 'collab';
export const AGENT_AUTHOR = 'sidekick';

// Display names — how each person is attributed on a message they didn't write.
export const OWNER_NAME = 'Luke';
export const COLLAB_NAME = 'Miranda';

const AUTHOR_NAMES = {
  [OWNER_AUTHOR]:  OWNER_NAME,
  [COLLAB_AUTHOR]: COLLAB_NAME,
  [AGENT_AUTHOR]:  'Sidekick',
};

// How to attribute a message. `viewer` is the author value of whoever is
// reading ('luke' in Mission Control, 'collab' on the Gig Ops page), so each
// person sees their own messages as "You" and everyone else by name — rather
// than every non-Luke message collapsing into "Sidekick".
export function authorLabel(author, viewer) {
  if (author === viewer) return 'You';
  return AUTHOR_NAMES[author] || author;
}

export function isAgentAuthor(author) {
  return author === AGENT_AUTHOR;
}

// Hostnames that should land on the Gig Ops page instead of Luke's Home hub,
// so Miranda's link needn't carry his name. These are Vercel domain aliases
// pointing at this same project — see docs/GIG_OPS_SETUP.md §5. Add any
// further alias (or a custom domain) to this list.
export const GIG_OPS_HOSTS = ['gigtracker-ops.vercel.app'];
