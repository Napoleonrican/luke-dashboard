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
 * Environment variables (Vercel project settings):
 *   GITHUB_TOKEN_GIG_OPS — fine-grained PAT, Napoleonrican/gig-tracker,
 *                          Contents: read-only.
 */

const GITHUB_OWNER = 'Napoleonrican';
const GITHUB_REPO = 'gig-tracker';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
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
