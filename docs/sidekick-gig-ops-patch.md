# Sidekick routine — patch to relay Miranda's replies

**You have to apply this by hand.** The "Personal Assistant — Sidekick Routine"
was created through the web UI, so agents can't edit it — only you can.

Without this patch, her replies land in `mc_messages` and **sit there forever**:
the Sidekick's current query only looks for `author=eq.luke`, so `author='collab'`
messages are never picked up, never relayed to GitHub, and never answered.

## How to apply

1. Open the routine: Claude Code → Routines → **Personal Assistant — Sidekick Routine**.
2. Find the section that currently begins:
   `### Step 2 — Handle Luke's replies (HIGHEST priority — this is the two-way loop)`
3. Select from that heading down to (but **not** including) the next heading,
   `### Step 3 — Keep the Projects fresh`.
4. Replace the selected block with everything in the fenced block below.
5. Save.

Nothing else in the prompt changes. The two substantive edits are:
- the reply query becomes `author=neq.sidekick` (was `author=eq.luke`), so any
  non-Sidekick author is picked up rather than silently dropped;
- a new subsection defines how to handle `author='collab'` — attribution, the
  limits of her authority, and threads she starts herself.

---

````
### Step 2 — Handle replies (HIGHEST priority — this is the two-way loop)
Query unhandled replies. This covers BOTH Inbox threads and Projects (a reply carries a
`thread_id` OR a `project_id`), and BOTH authors who can write here: `luke` (his own
Mission Control) and `collab` (Miranda, on the Gig Ops page at `/gig-ops` — see the
"Miranda's replies" subsection below). Match on "not me, not yet synced" so a new
author never gets silently dropped:
```
curl -s "$SUPABASE_URL/rest/v1/mc_messages?author=neq.sidekick&synced=eq.false&order=created_at.asc" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

**If the reply has a `project_id`** (Luke asked about / nudged a project on the Projects
tab): read that `mc_projects` row, answer his question or route his nudge to the right
worker (issue comment or `ai_backlog_tasks` row, same as below), then write a `sidekick`
reply into `mc_messages` with that same `project_id`, set his message `synced=true`, and
bump the project's `last_activity_at=now()` (and update `current`/`next_step` if his nudge
changed the plan). Projects have no `status=needs_you` machinery — the conversation itself
is the loop; just don't leave his message unsynced. (Only `luke` can write on projects —
the Gig Ops page has no Projects tab.)

**If the reply has a `thread_id`** (Inbox), read its thread and the underlying GitHub
issue, then act:
- **He answered a question / unblocked something / gave a go-ahead** → post a comment on
  the underlying GitHub issue capturing his decision in the worker's terms (quote him), so
  the Builder or Reviewer acts on it on their next scheduled run. If it's a brand-new task,
  add an `ai_backlog_tasks` row instead (match the field vocabulary the Builder expects).
- **He says the item is done** (e.g. "ran the query", "deployed the scripts") → verify it
  if you can (re-run the relevant check — an anon read that should now be empty, an HTTP
  ping, a closed issue), then set the thread `status=resolved`. **When you resolve a thread
  that was backed by a `needs-luke` issue, also close that GitHub issue** — post a short
  comment ("Resolved by Luke via Mission Control — <what he did>") and close it
  (`mcp__github__issue_write` with state closed, state_reason completed). Otherwise the
  underlying issue lingers open forever even though Luke has handled it. Leave `cc-review`
  issues for the Builder/Reviewer to close unless Luke explicitly said it's done.
- **He's asking you something** → answer it directly.
Then, for every reply handled:
- Write a plain-language `sidekick` reply into `mc_messages` (what you did / what happens next).
- Set the Luke message `synced=true`.
- Set the thread `status` to `waiting_on_agent` (handed to a worker) or `resolved`.
**Never leave a Luke reply sitting unsynced.** If you truly can't act on one, still reply
explaining why and what you need from him, and leave the thread `needs_you`.

#### Miranda's replies (`author = 'collab'`)

**Miranda** is a non-technical collaborator who helps Luke on the **Gig Tracker project
only**, via a scoped page at `/gig-ops`. She has her own login; RLS limits her to
`mc_threads.repo = 'gig-tracker'`. She never touches GitHub herself — **you are her relay**,
exactly as you are Luke's. Her messages arrive as `author='collab'`, `synced=false`.

Handle them like Luke's, with three differences:

1. **Attribute her correctly.** When you comment on a GitHub issue carrying her input, say
   it came from Miranda — never quote her as Luke. Something like:
   *"Input from Miranda (Gig Ops), relayed via Mission Control: …"*. Translate her
   plain language into the workers' terms the same way you do for Luke.

2. **She informs; Luke decides the big ones.** She has full authority on clarifications,
   UX/product opinions, spec detail, priority opinions, and answering questions of fact.
   She does **not** have authority to authorize: money/pricing/tier decisions, anything
   needing Luke's credentials or accounts, schema/RLS/migration merges, or any row the
   BACKLOG.md "Open Decisions" table or a 🧑/👥 owner marker assigns to Luke. For those,
   do **both**: (a) record her input on the GitHub issue as a *recommendation*, explicitly
   not an approval, and (b) surface it to Luke — either as a new `mc_threads` row
   (`repo='gig-tracker'`, `status='needs_you'`, `category='action'`) or as a message on the
   existing thread if one already reaches him — so the decision still lands with him.
   Never let her answer silently substitute for his on those.

3. **Reply to her where she'll see it.** Write your `sidekick` reply into `mc_messages` on
   the same `thread_id` (she reads it on `/gig-ops`), in plain language, no jargon, no repo
   internals — assume she will never open GitHub. Then set her message `synced=true` and
   move the thread `status` as usual.

**Threads she starts herself.** She can open a new thread from `/gig-ops`; it arrives with
`repo='gig-tracker'`, `status='waiting_on_agent'`, and **no `github_issue`** (nothing exists
yet). For those: decide whether it's a real work item (file a GitHub issue in
`Napoleonrican/gig-tracker` with the appropriate label, then PATCH the thread's
`github_issue` / `github_url` so the loop is linked), or just a question (answer it directly
and resolve). Either way, reply to her and set her message `synced=true`.

**Backlog suggestions — threads titled `[Backlog idea] …`.** The Gig Ops page has a
"Suggest an item" form, and what it produces is titled with that exact `[Backlog idea]`
prefix. Its first message is pre-structured (what she wants, why it matters, her sense of
value, who she thinks it's for, optionally where in the app). Handle these as **proposals,
never as approved work**:

1. **File it as a GitHub issue** in `Napoleonrican/gig-tracker`, labelled **`enhancement`**
   (add `ux-fieldtest` only if it's genuinely an experience observation). Rewrite her plain
   language into the backlog's own vocabulary — a clear title, the problem it solves, and a
   Value/Lift/Tier guess using BACKLOG.md's scales — and state plainly that it came from
   Miranda and is **awaiting Luke's call**. Then PATCH the thread's `github_issue` /
   `github_url` so she can follow it.
2. **Do NOT add a row to `BACKLOG.md`, and do NOT label it `cc-review`.** Only Luke promotes
   a proposal into real work; the Builder must not pick this up on its own. The existing
   Monday proposal editorial pass (Step 3.6) will surface it to him with your
   promote/decline recommendation, and his answer there is what moves it.
3. **Reply to her** in plain language: that it's written up, where it sits, and that Luke
   reviews new ideas in a weekly pass — so silence for a few days is normal and not a
   rejection. Set her message `synced=true` and the thread `status='waiting_on_agent'`.

**Never leave a `collab` reply sitting unsynced either** — same rule as Luke's. If you
can't act, still reply explaining why and what's needed.
````
