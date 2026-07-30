# Gig Ops (`/gig-ops`) — one-time setup

Everything below is yours to do once. None of it lives in the app UI — that page
belongs entirely to Miranda.

The page itself is at `/gig-ops`. It's direct-link only (no tile on the Home hub,
not listed in `homeModules.js`), and it shows her two tabs: **Mission &
Background** and **Backlog & Decisions**.

---

## 1. Create her account (she picks her own password)

### 1a. Allow her hostname to receive auth links — do this FIRST

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Open the **Luke's Dashboard** project (the same one Cashflow and Mission
   Control already use).
3. **Authentication → URL Configuration → Redirect URLs**, and add:
   ```
   https://gigtracker-ops.vercel.app/**
   ```
   Keep your own dashboard URL in the list too. Add any Vercel *preview* URL you
   want to test on as well.

**This step is not optional.** The app sends her password link pinned to whatever
hostname she's using. If that host isn't allow-listed, Supabase refuses the
redirect and falls back to the project's **Site URL** — your hostname — and she'd
end up signed in on *your* URL instead of hers. Browser sessions are scoped per
hostname, so that session would not carry over to `gigtracker-ops.vercel.app` and
she'd be stuck at the sign-in screen with no way through.

### 1b. Create the user

1. **Authentication → Users → Add user → Create new user**.
2. Enter her email and any throwaway password — **you can discard it, she'll never
   use it.** Tick **Auto Confirm User** so there's no confirmation step.
3. Click **Create user**.

### 1c. Let her set her own password

Send her just this: **https://gigtracker-ops.vercel.app**

1. She clicks **"First time here, or forgot your password?"** under the sign-in box.
2. She enters her email and gets a link.
3. Opening it brings her back to *her* hostname, already signed in, and the app
   asks her to choose a password.

You never pick, see, or transmit her password — and this same flow is how she
resets it later if she forgets, with no involvement from you.

> **Note on email:** Supabase's built-in email sender is rate-limited (a handful
> per hour) and meant for low volume — fine here. If nothing arrives, check spam,
> then try again after a few minutes.

> **If you'd rather skip passwords entirely:** the Gig Tracker app itself uses
> magic-link sign-in (a fresh emailed link each time, nothing to remember). That
> would be a small change to `GigOpsAuthGate` if you ever prefer it.

---

## 2. Run the database change that scopes her access

This is what makes it *impossible* for her account to read anything outside the
Gig Tracker project — not just hidden in the UI, but blocked by the database.

1. In Supabase, open the same project.
2. In the left sidebar, click **SQL Editor**.
3. Click **New query**.
4. Open `supabase/migrations/047_gig_ops_scope.sql` in this repo and copy its
   entire contents.
5. Paste it into the query box.
6. Click **Run** (bottom right, or Ctrl/Cmd+Enter). You should see
   *"Success. No rows returned."*

**Note:** the owner check inside that migration is your email, hardcoded to match
`OWNER_EMAIL` in `src/lib/authConfig.js`. If that email ever changes, both need
updating together.

---

## 3. Add the read-only GitHub token

Only needed so her Decisions tab can display the live `BACKLOG.md` — the
Gig Tracker repo is private, so the browser can't fetch it directly. This token
**cannot write anything**; her replies never touch GitHub from the browser
(see §4).

1. Go to [github.com](https://github.com) and sign in.
2. Click your profile picture (top right) → **Settings**.
3. In the left sidebar, scroll to **Developer settings**.
4. Click **Personal access tokens** → **Fine-grained tokens** →
   **Generate new token**.
5. Name it something like `gig-ops backlog read`. Under **Repository access**,
   choose **Only select repositories** and pick `gig-tracker`.
6. Under **Permissions → Repository permissions**, set **Contents** to
   **Read-only**. Leave everything else at "No access" — in particular, it does
   **not** need Issues access.
7. Click **Generate token** and copy the value (you won't see it again).
8. Go to [vercel.com](https://vercel.com), open the Luke's Dashboard project →
   **Settings** → **Environment Variables**.
9. Add `GITHUB_TOKEN_GIG_OPS` with the token as its value, and save.
10. Redeploy so the variable takes effect.

---

## 4. Patch the Sidekick routine — ⚠️ REQUIRED, and only you can do it

Her answers do **not** post to GitHub directly. They land in `mc_messages` with
`author = 'collab'` and `synced = false` — exactly the shape your own replies
take — and the **Sidekick routine** reads them, interprets them, and speaks to
the GitHub issue in the worker agents' terms.

**This does not work until you patch the routine.** The Sidekick currently
queries only `author=eq.luke`, so her messages would sit unsynced forever —
never relayed, never answered. Agents can't edit that routine (it was created
via the web UI), so it has to be you.

👉 **See [`sidekick-gig-ops-patch.md`](./sidekick-gig-ops-patch.md)** for the
exact block to paste in and where it goes. It's a single find-and-replace of
the routine's "Step 2" section.

The `'collab'` value is defined as `COLLAB_AUTHOR` in
`src/pages/gig-ops/DecisionsTab.jsx` — keep the two in sync.

---

## 5. (Optional) Give her a URL without your name in it

Today the link is `luke-dashboard-three.vercel.app/gig-ops`. Two ways to change
what she sees — both point at this *same* project and deployment, so there's
nothing to maintain twice.

**The landing behaviour is identical either way.** Making the bare hostname show
her page is done by the app (`GIG_OPS_HOSTS` in `src/lib/authConfig.js`), not by
Vercel — so it works exactly the same on a free `*.vercel.app` alias as on a
paid custom domain. Nothing here requires buying anything.

### Option A — a second free `.vercel.app` name (no cost)

1. Vercel → the Luke's Dashboard project → **Settings** → **Domains**.
2. **Add** a domain and type a name like `gigtracker-ops.vercel.app`. It has to
   be globally unique, so you may need a couple of tries.
3. Once it's added, edit `GIG_OPS_HOSTS` in `src/lib/authConfig.js` to match the
   name you actually claimed.

**Already done:** `gigtracker-ops.vercel.app` is claimed and configured in
`GIG_OPS_HOSTS`, so this section is only here for adding another alias later.

With that in place, `gigtracker-ops.vercel.app` on its own **renders** the Gig Ops page
— it doesn't redirect, so her address bar stays at the bare hostname with no path
at all. She never needs to remember `/gig-ops`, and your name never appears.
(`/gig-ops` still works on every hostname, including this one.)

> **Why the host list is in the app rather than a `vercel.json` rewrite:** this is
> a single-page app. A server rewrite would serve `index.html` without changing
> the path React Router reads, so `/` would still render the Home hub. The check
> in `App.jsx` runs on the client, which actually works.

### Option B — a real custom domain (~$10–15/year)

Same flow, but in step 2 add a domain you own (e.g. `gigops.app`). Vercel walks
you through the DNS records. Then add that hostname to `GIG_OPS_HOSTS` too.

**Note:** either way, the rest of the dashboard is still reachable on the new
hostname (`/cashflow`, etc.) — it's the same app. Those routes are gated to your
account, so she'd hit a sign-in wall rather than your data, but it isn't a
separate deployment and shouldn't be treated as one.

---

## 6. (Optional) Show the build's commit hash on hover

The Gig Ops header already shows "Last updated <date>" — that needs nothing
from you, it's captured automatically at build time. Hovering it also shows a
short commit hash, purely for your own use in confirming a specific deploy
landed; Miranda never sees it (it's a tooltip, not visible text).

That hash only appears if Vercel is passing git info into the build. To turn
that on: **Vercel → the project → Settings → Environment Variables →
"Automatically expose System Environment Variables"** — toggle it on and
redeploy. Skip this and the date still shows fine; you just won't get the hash.

---

## 7. If you ever change the Sidekick's schedule

The cadence (currently `0 9-23/4,1 * * *` — five runs a day, roughly every 4
hours, with one longer stretch overnight) is described in plain language in a
few places, so people know a reply isn't instant without needing to read cron:

- `src/pages/gig-ops/MissionTab.jsx` — "When you'll see something here" card
- The pending-reply tooltip in `src/pages/gig-ops/DecisionsTab.jsx`
- The matching tooltips in `src/pages/mission-control/InboxTab.jsx` and
  `ProjectsTab.jsx`

None of these read the schedule live — if you change it, update the wording by
hand in those four spots.

---

## Recurring: approving a pending database change

Not specific to Gig Ops, but it comes up (e.g. the Gig Tracker RLS migration in
PR #201, still open at the time of writing):

1. Open the pull request on GitHub.
2. Read the description and the changed files — it should say plainly what it does.
3. If it looks right: Supabase → your project → **SQL Editor** → **New query**.
4. Copy the SQL file's contents from the PR, paste it in, click **Run**.
5. Back on GitHub, click **Merge pull request**.
