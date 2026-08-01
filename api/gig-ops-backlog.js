/**
 * /api/gig-ops-backlog — read-only BACKLOG.md fetch for Gig Ops (/gig-ops).
 *
 * The Gig Tracker repo is private, so the browser can't fetch BACKLOG.md
 * directly. This runs on Vercel with a read-only token so the Decisions tab
 * can render the live backlog without ever exposing the token to the client.
 *
 * Deliberately read-only. Replies from the Gig Ops page do NOT post to GitHub
 * from here — they land in `mc_messages` unsynced, and the Sidekick routine
 * reads, interprets, and relays them to the right GitHub issue in the worker
 * agents' terms, exactly as it already does for Luke's own replies. So this
 * token needs Contents: read only — no Issues write access anywhere.
 *
 * Auth: this endpoint is behind the same sign-in wall as the /gig-ops page it
 * feeds. The private repo's backlog must never be readable by an anonymous
 * caller who simply discovers the URL, so we require the caller to forward
 * their Supabase access token (Authorization: Bearer <jwt>) and validate it
 * server-side against Supabase Auth before proxying anything to GitHub. Any
 * real signed-in account passes — that mirrors GigOpsAuthGate, which also
 * unlocks for any authenticated session (the data boundary is RLS on the mc_*
 * tables, not this gate). Missing/invalid token -> 401.
 *
 * Environment variables (Vercel project settings):
 *   GITHUB_TOKEN_GIG_OPS — fine-grained PAT, Napoleonrican/gig-tracker,
 *                          Contents: read-only.
 *   SUPABASE_URL / VITE_SUPABASE_URL           — Supabase project URL.
 *   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY — anon (publishable) key, used
 *                          only as the apikey header when validating the token.
 */

const GITHUB_OWNER = 'Napoleonrican';
const GITHUB_REPO = 'gig-tracker';

export const config = { maxDuration: 30 };

// Validate the caller's Supabase access token against Supabase Auth. Returns
// true only for a real, unexpired session; false for missing/invalid/expired.
async function callerIsAuthenticated(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return false;
  const accessToken = match[1].trim();
  if (!accessToken) return false;

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;

  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) return false;
    const user = await res.json();
    return !!(user && user.id);
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!(await callerIsAuthenticated(req))) {
    res.status(401).json({ error: 'Sign in to view the backlog.' });
    return;
  }

  const token = process.env.GITHUB_TOKEN_GIG_OPS;
  if (!token) {
    res.status(500).json({ error: 'GITHUB_TOKEN_GIG_OPS is not set on the server.' });
    return;
  }

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/BACKLOG.md`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.raw+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );
    if (!ghRes.ok) {
      res.status(502).json({ error: `Could not fetch BACKLOG.md (${ghRes.status}).` });
      return;
    }
    const markdown = await ghRes.text();
    res.status(200).json({ markdown, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach GitHub.', detail: String(e).slice(0, 300) });
  }
}
