import { useState } from 'react';
import { ChevronDown, ChevronUp, KeyRound, DatabaseZap, GitPullRequestArrow, UserPlus } from 'lucide-react';

function Step({ n, children }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-semibold flex items-center justify-center mt-0.5">{n}</span>
      <span className="text-xs text-zinc-400 leading-relaxed">{children}</span>
    </li>
  );
}

function Guide({ icon: Icon, title, accent, defaultOpen = false, intro, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon size={15} className={accent} />
          <span className="text-sm font-semibold text-zinc-200">{title}</span>
        </div>
        {open ? <ChevronUp size={13} className="text-zinc-600" /> : <ChevronDown size={13} className="text-zinc-600" />}
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-4 py-3">
          {intro && <p className="text-xs text-zinc-500 mb-2.5">{intro}</p>}
          <ol className="space-y-2.5">{children}</ol>
        </div>
      )}
    </div>
  );
}

// Owner-only walkthroughs for the one-time/occasional manual steps this
// feature introduces. Written literally, from opening the console through
// running the code — no assumed familiarity with "migrations" or "RLS."
export default function SetupGuideTab() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        These are things only you can do — none of them repeat often. Each one is a full
        walkthrough, click by click.
      </p>

      <Guide icon={UserPlus} title="1. Give her a login" accent="text-cyan-400" defaultOpen>
        <Step n={1}>Go to <code className="text-zinc-300">supabase.com</code> and sign in.</Step>
        <Step n={2}>Open your Luke's Dashboard project (the same one Cashflow/Mission Control already use).</Step>
        <Step n={3}>In the left sidebar, click <strong className="text-zinc-300">Authentication</strong>.</Step>
        <Step n={4}>Click the <strong className="text-zinc-300">Users</strong> tab, then the green <strong className="text-zinc-300">Add user</strong> button (top right) → <strong className="text-zinc-300">Create new user</strong>.</Step>
        <Step n={5}>Enter her email address and a temporary password. Check <strong className="text-zinc-300">Auto Confirm User</strong> so she doesn't need to click an email link.</Step>
        <Step n={6}>Click <strong className="text-zinc-300">Create user</strong>.</Step>
        <Step n={7}>Send her the link to <code className="text-zinc-300">/gig-ops</code> plus that email + temporary password. She can sign in right away — there's no separate "sign up" step needed.</Step>
      </Guide>

      <Guide icon={DatabaseZap} title="2. Run the database change that keeps her scoped to Gig Tracker" accent="text-amber-400">
        <Step n={1}>In Supabase, open your project (same one as above).</Step>
        <Step n={2}>In the left sidebar, click <strong className="text-zinc-300">SQL Editor</strong>.</Step>
        <Step n={3}>Click <strong className="text-zinc-300">New query</strong>.</Step>
        <Step n={4}>Open the file <code className="text-zinc-300">supabase/migrations/047_gig_ops_scope.sql</code> in this repo, and copy its entire contents.</Step>
        <Step n={5}>Paste it into the query box in Supabase.</Step>
        <Step n={6}>Click <strong className="text-zinc-300">Run</strong> (bottom right, or Ctrl/Cmd+Enter). You should see "Success. No rows returned."</Step>
        <Step n={7}>That's it — this is what makes it impossible for her account to see anything outside Gig Tracker, even if someone tried.</Step>
      </Guide>

      <Guide icon={KeyRound} title="3. Add the GitHub key so her answers post automatically" accent="text-violet-400">
        <Step n={1}>Go to <code className="text-zinc-300">github.com</code> and sign in as yourself.</Step>
        <Step n={2}>Click your profile picture (top right) → <strong className="text-zinc-300">Settings</strong>.</Step>
        <Step n={3}>In the left sidebar, scroll down to <strong className="text-zinc-300">Developer settings</strong>.</Step>
        <Step n={4}>Click <strong className="text-zinc-300">Personal access tokens</strong> → <strong className="text-zinc-300">Fine-grained tokens</strong> → <strong className="text-zinc-300">Generate new token</strong>.</Step>
        <Step n={5}>Give it a name like "Gig Ops reply bot." Under <strong className="text-zinc-300">Repository access</strong>, choose <strong className="text-zinc-300">Only select repositories</strong> and pick <code className="text-zinc-300">gig-tracker</code>.</Step>
        <Step n={6}>Under <strong className="text-zinc-300">Permissions</strong> → <strong className="text-zinc-300">Repository permissions</strong>, find <strong className="text-zinc-300">Issues</strong> and set it to <strong className="text-zinc-300">Read and write</strong>.</Step>
        <Step n={7}>Click <strong className="text-zinc-300">Generate token</strong> and copy the value shown (you won't see it again).</Step>
        <Step n={8}>Go to <code className="text-zinc-300">vercel.com</code>, open the Luke's Dashboard project → <strong className="text-zinc-300">Settings</strong> → <strong className="text-zinc-300">Environment Variables</strong>.</Step>
        <Step n={9}>Add a new variable named <code className="text-zinc-300">GITHUB_TOKEN_GIG_OPS</code>, paste the token as the value, and save.</Step>
        <Step n={10}>Redeploy the project (Vercel usually prompts you, or trigger one from the Deployments tab) so the new variable takes effect.</Step>
      </Guide>

      <Guide
        icon={GitPullRequestArrow}
        title="General: approving a pending database change"
        accent="text-zinc-400"
        intro={'Use this any time you see a note that a database change is "open, awaiting your review" — it comes up more than once.'}
      >
        <Step n={1}>Open the pull request link you were given on GitHub.</Step>
        <Step n={2}>Read the description and the file changes — it'll say in plain terms what it does.</Step>
        <Step n={3}>If it looks right, go to Supabase → your project → <strong className="text-zinc-300">SQL Editor</strong> → <strong className="text-zinc-300">New query</strong>.</Step>
        <Step n={4}>Copy the SQL file's contents from the pull request, paste it in, and click <strong className="text-zinc-300">Run</strong>.</Step>
        <Step n={5}>Back on GitHub, click <strong className="text-zinc-300">Merge pull request</strong> to close it out.</Step>
      </Guide>
    </div>
  );
}
