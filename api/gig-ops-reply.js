/**
 * /api/gig-ops-reply — Gig Ops Mission Control (Vercel serverless function).
 *
 * Backs the "Backlog & Decisions" tab at /gig-ops. Two jobs, kept in one
 * function since each is a single small external call:
 *
 *   GET  ?action=backlog  → fetch the live BACKLOG.md from the gig-tracker
 *                           repo (so the page never shows a stale copy).
 *   POST                  → post the collaborator's (or Luke's) answer to a
 *                           needs-luke thread straight onto the linked GitHub
 *                           issue as a comment ("posts directly" — no waiting
 *                           on the Sidekick routine's next scheduled pass),
 *                           then record it in mc_messages / mc_threads.
 *
 * Runs on Vercel, not the browser, so the GitHub token never reaches the
 * client. Hard-scoped to the gig-tracker repo only — this is not a general
 * mc_threads writer.
 *
 * Environment variables (Vercel project settings):
 *   GITHUB_TOKEN_GIG_OPS         — fine-grained PAT, Napoleonrican/gig-tracker,
 *                                  Issues: read & write only.
 *   SUPABASE_URL                 — your Supabase project URL.
 *   SUPABASE_SERVICE_ROLE_KEY    — service_role key (read/write mc_* tables).
 * (Falls back to VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for the URL.)
 */

const GITHUB_OWNER = 'Napoleonrican';
const GITHUB_REPO = 'gig-tracker';
const GITHUB_API = 'https://api.github.com';

export const config = { maxDuration: 30 };

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function handleBacklog(req, res, token) {
  const ghRes = await fetch(
    `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/BACKLOG.md`,
    { headers: { ...githubHeaders(token), Accept: 'application/vnd.github.raw+json' } }
  );
  if (!ghRes.ok) {
    res.status(502).json({ error: `Could not fetch BACKLOG.md (${ghRes.status}).` });
    return;
  }
  const markdown = await ghRes.text();
  res.status(200).json({ markdown, fetchedAt: new Date().toISOString() });
}

async function handleReply(req, res, token, supabaseUrl, supabaseKey) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};
  const threadId = String(body.threadId || '');
  const replyText = String(body.replyText || '').trim();
  const authorLabel = String(body.authorLabel || 'collaborator').trim() || 'collaborator';
  const markResolved = !!body.markResolved;

  if (!threadId || !replyText) {
    res.status(400).json({ error: 'threadId and replyText are required.' });
    return;
  }

  const sHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };
  const base = supabaseUrl.replace(/\/$/, '');

  // 1) Load the thread — hard-scope this endpoint to gig-tracker only.
  const threadRes = await fetch(
    `${base}/rest/v1/mc_threads?id=eq.${encodeURIComponent(threadId)}&select=*`,
    { headers: sHeaders }
  );
  if (!threadRes.ok) {
    res.status(502).json({ error: 'Could not read the thread.' });
    return;
  }
  const [thread] = await threadRes.json();
  if (!thread) {
    res.status(404).json({ error: 'Thread not found.' });
    return;
  }
  if (thread.repo !== GITHUB_REPO) {
    res.status(403).json({ error: 'This endpoint only handles gig-tracker threads.' });
    return;
  }

  // 2) Post the comment straight to the linked GitHub issue, if there is one.
  let commentUrl = null;
  if (thread.github_issue) {
    const commentBody = `**Reply from ${authorLabel} via Gig Ops Mission Control:**\n\n${replyText}`;
    const ghRes = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${thread.github_issue}/comments`,
      {
        method: 'POST',
        headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody }),
      }
    );
    if (!ghRes.ok) {
      const detail = await ghRes.text();
      res.status(502).json({ error: `GitHub comment failed (${ghRes.status}).`, detail: detail.slice(0, 300) });
      return;
    }
    const ghComment = await ghRes.json();
    commentUrl = ghComment.html_url || null;
  }

  // 3) Record it in mc_messages — synced: true, since it's already posted;
  //    nothing left for the Sidekick routine to relay.
  await fetch(`${base}/rest/v1/mc_messages`, {
    method: 'POST',
    headers: { ...sHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ thread_id: threadId, author: authorLabel, body: replyText, synced: true }),
  });

  // 4) Update thread status — same transition Luke's own reply already
  //    causes today, unless she's explicitly marking it resolved.
  await fetch(`${base}/rest/v1/mc_threads?id=eq.${encodeURIComponent(threadId)}`, {
    method: 'PATCH',
    headers: sHeaders,
    body: JSON.stringify({ status: markResolved ? 'resolved' : 'waiting_on_agent' }),
  });

  res.status(200).json({ ok: true, commentUrl });
}

export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN_GIG_OPS;
  if (!token) {
    res.status(500).json({ error: 'GITHUB_TOKEN_GIG_OPS is not set on the server.' });
    return;
  }

  if (req.method === 'GET' && req.query?.action === 'backlog') {
    try {
      await handleBacklog(req, res, token);
    } catch (e) {
      res.status(502).json({ error: 'Failed to reach GitHub.', detail: String(e).slice(0, 300) });
    }
    return;
  }

  if (req.method === 'POST') {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      res.status(500).json({ error: 'Supabase env vars are not set on the server.' });
      return;
    }
    try {
      await handleReply(req, res, token, supabaseUrl, supabaseKey);
    } catch (e) {
      res.status(502).json({ error: 'Failed to post the reply.', detail: String(e).slice(0, 300) });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
