import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch, RefreshCw, MessageSquare, ChevronDown, ChevronUp,
  Send, AlertCircle, ExternalLink, KeyRound,
} from 'lucide-react';
import TopNav from '../components/TopNav';

const REPOS = [
  { owner: 'napoleonrican', repo: 'personal-assistant' },
  { owner: 'napoleonrican', repo: 'luke-dashboard' },
  { owner: 'napoleonrican', repo: 'gig-tracker' },
  { owner: 'napoleonrican', repo: 'gas-price-forecast' },
  { owner: 'napoleonrican', repo: 'daily-planner' },
];

const LABEL_STYLES = {
  'cc-review':     'bg-red-900/40 text-red-300',
  'needs-luke':    'bg-amber-900/40 text-amber-300',
  'cc-review-log': 'bg-zinc-700 text-zinc-400',
  'enhancement':   'bg-blue-900/40 text-blue-300',
};

const ACTION_LABEL_SET  = new Set(['cc-review', 'needs-luke']);
const SUMMARY_LABEL_SET = new Set(['cc-review-log']);

const GH_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;

function ghHeaders() {
  const h = { Accept: 'application/vnd.github+json' };
  if (GH_TOKEN) h.Authorization = `Bearer ${GH_TOKEN}`;
  return h;
}

/**
 * Returns { issues: IssueWithRepo[], failedRepos: string[] }.
 * Per-repo 4xx/5xx is captured in failedRepos instead of silently returning
 * an empty array, so the UI can distinguish "auth required" from "no issues".
 */
async function fetchAllIssues() {
  const results = await Promise.allSettled(
    REPOS.map(async ({ owner, repo }) => {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=50`,
        { headers: ghHeaders() }
      );
      if (!res.ok) return { repo, ok: false, status: res.status, issues: [] };
      const data = await res.json();
      return {
        repo,
        ok: true,
        issues: data.map(issue => ({ ...issue, _repo: repo, _owner: owner })),
      };
    })
  );

  const fulfilled = results.map(r =>
    r.status === 'fulfilled' ? r.value : { ok: false, issues: [], repo: undefined }
  );
  const allIssues   = fulfilled.flatMap(r => r.issues);
  const failedRepos = fulfilled.filter(r => !r.ok && r.repo).map(r => r.repo);

  return { issues: allIssues, failedRepos };
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function IssueCard({ issue, onReplyPosted }) {
  const [expanded, setExpanded]   = useState(false);
  const [replying, setReplying]   = useState(false);
  const [comment, setComment]     = useState('');
  const [posting, setPosting]     = useState(false);
  const [postError, setPostError] = useState('');
  const [posted, setPosted]       = useState(false);

  async function postReply() {
    if (!comment.trim() || !GH_TOKEN) return;
    setPosting(true);
    setPostError('');
    try {
      const res = await fetch(
        `https://api.github.com/repos/${issue._owner}/${issue._repo}/issues/${issue.number}/comments`,
        {
          method: 'POST',
          headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: comment.trim() }),
        }
      );
      if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
      setComment('');
      setReplying(false);
      setPosted(true);
      onReplyPosted?.();
    } catch (err) {
      setPostError(err.message || 'Failed to post reply');
    } finally {
      setPosting(false);
    }
  }

  const labelOrder = [
    ...issue.labels.filter(l => ACTION_LABEL_SET.has(l.name)),
    ...issue.labels.filter(l => SUMMARY_LABEL_SET.has(l.name)),
    ...issue.labels.filter(l => !ACTION_LABEL_SET.has(l.name) && !SUMMARY_LABEL_SET.has(l.name)),
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Clickable header */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="text-[10px] text-zinc-600">{issue._repo} #{issue.number}</span>
            {labelOrder.map(l => (
              <span
                key={l.name}
                className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${LABEL_STYLES[l.name] || 'bg-zinc-700 text-zinc-400'}`}
              >
                {l.name}
              </span>
            ))}
          </div>
          <p className="text-sm text-zinc-200 leading-snug">{issue.title}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-zinc-600">{formatDate(issue.created_at)}</span>
            {issue.comments > 0 && (
              <span className="text-[10px] text-zinc-600 flex items-center gap-0.5">
                <MessageSquare size={9} />{issue.comments}
              </span>
            )}
            {posted && <span className="text-[10px] text-green-500">Reply posted ✓</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <a
            href={issue.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
            onClick={e => e.stopPropagation()}
            title="Open in GitHub"
          >
            <ExternalLink size={11} />
          </a>
          {expanded
            ? <ChevronUp size={13} className="text-zinc-600" />
            : <ChevronDown size={13} className="text-zinc-600" />}
        </div>
      </div>

      {/* Expanded body + reply */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3">
          {issue.body ? (
            <div className="text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto pr-1 font-mono">
              {issue.body}
            </div>
          ) : (
            <p className="text-xs text-zinc-600 italic">No description.</p>
          )}

          <div className="mt-3">
            {!replying ? (
              <button
                onClick={e => { e.stopPropagation(); setReplying(true); }}
                disabled={!GH_TOKEN}
                title={GH_TOKEN ? undefined : 'Add VITE_GITHUB_TOKEN to Vercel env vars to enable replies'}
                className={`text-xs flex items-center gap-1 transition-colors ${
                  GH_TOKEN
                    ? 'text-violet-400 hover:text-violet-300'
                    : 'text-zinc-700 cursor-not-allowed'
                }`}
              >
                <MessageSquare size={11} />
                {GH_TOKEN ? 'Reply' : 'Reply (token required)'}
              </button>
            ) : (
              <div onClick={e => e.stopPropagation()}>
                <textarea
                  autoFocus
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Type your reply..."
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 placeholder-zinc-600 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                  onKeyDown={e => { if (e.key === 'Escape') { setReplying(false); setComment(''); } }}
                />
                {postError && (
                  <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={10} />{postError}
                  </p>
                )}
                <div className="flex justify-end gap-2 mt-1.5">
                  <button
                    onClick={() => { setReplying(false); setComment(''); setPostError(''); }}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={postReply}
                    disabled={posting || !comment.trim()}
                    className="text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded px-3 py-1 flex items-center gap-1 transition-colors"
                  >
                    <Send size={10} />
                    {posting ? 'Posting…' : 'Post Reply'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GitHubIssues() {
  const [issues, setIssues]           = useState([]);
  const [failedRepos, setFailedRepos] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [activeTab, setActiveTab]     = useState('action');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { issues: all, failedRepos: failed } = await fetchAllIssues();
      setIssues(all);
      setFailedRepos(failed);
    } catch (err) {
      setError(err.message || 'Failed to fetch issues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const actionIssues  = issues.filter(i => i.labels.some(l => ACTION_LABEL_SET.has(l.name)));
  const summaryIssues = issues.filter(i => i.labels.some(l => SUMMARY_LABEL_SET.has(l.name)));
  const displayed     = activeTab === 'action' ? actionIssues : summaryIssues;

  const hasFailedRepos = failedRepos.length > 0;

  const tabs = [
    {
      key:         'action',
      label:       'Needs Your Attention',
      count:       actionIssues.length,
      activeClass: 'text-amber-300 border-amber-500',
      countClass:  'bg-amber-900/50 text-amber-300',
    },
    {
      key:         'summary',
      label:       'Agent Summaries',
      count:       summaryIssues.length,
      activeClass: 'text-zinc-300 border-zinc-500',
      countClass:  'bg-zinc-800 text-zinc-400',
    },
  ];

  return (
    <div className="min-h-screen text-white">
      <TopNav />
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GitBranch size={18} className="text-zinc-400" />
              <h1 className="text-lg font-semibold">GitHub Issues</h1>
            </div>
            <p className="text-xs text-zinc-500">
              {GH_TOKEN
                ? 'Read and reply to issues across all your repos without leaving the dashboard.'
                : <>
                    4 of your 5 repos are private.{' '}
                    <span className="text-amber-400">Add VITE_GITHUB_TOKEN to Vercel to read their issues and enable inline replies.</span>
                  </>}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50 mt-0.5 flex-shrink-0"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2.5 mb-5 text-xs text-red-300">
            <AlertCircle size={13} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Fetch-failure banner — surfaces whenever any repo couldn't be read */}
        {!loading && hasFailedRepos && (
          <div className="flex items-start gap-2.5 bg-amber-950/40 border border-amber-800/50 rounded-lg px-3 py-2.5 mb-5 text-xs text-amber-300">
            <KeyRound size={13} className="flex-shrink-0 mt-0.5" />
            <div>
              {GH_TOKEN ? (
                <>
                  <span className="font-medium">Couldn't read some repos — token may be expired, rate-limited, or missing scope.</span>{' '}
                  Issues from these repos won't appear until the token is refreshed:{' '}
                  <span className="text-amber-200">{failedRepos.join(', ')}</span>.
                </>
              ) : (
                <>
                  <span className="font-medium">Token required to read private repos.</span>{' '}
                  The following repos returned a read error (401/404) — their issues won't appear until
                  you add <code className="bg-zinc-800 px-1 py-0.5 rounded text-amber-200">VITE_GITHUB_TOKEN</code> to
                  your Vercel environment:{' '}
                  <span className="text-amber-200">{failedRepos.join(', ')}</span>.
                </>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-zinc-800">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? tab.activeClass
                  : 'text-zinc-600 border-transparent hover:text-zinc-400'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === tab.key ? tab.countClass : 'bg-zinc-800 text-zinc-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Issue list */}
        {loading ? (
          <div className="text-center py-16 text-zinc-600 text-sm">Loading issues…</div>
        ) : displayed.length === 0 ? (
          hasFailedRepos ? (
            <div className="text-center py-16">
              <p className="text-zinc-500 text-sm mb-1">
                {GH_TOKEN
                  ? "Some repos couldn't be read"
                  : 'No issues loaded from private repos'}
              </p>
              <p className="text-zinc-700 text-xs">
                {GH_TOKEN
                  ? `Token may be expired or missing scope for: ${failedRepos.join(', ')}.`
                  : <>Add <code className="bg-zinc-800 px-1 rounded">VITE_GITHUB_TOKEN</code> to Vercel to see issues from {failedRepos.join(', ')}.</>}
              </p>
            </div>
          ) : (
            <div className="text-center py-16 text-zinc-700 text-sm">
              {activeTab === 'action'
                ? 'No open issues need your attention.'
                : 'No agent summaries found.'}
            </div>
          )
        ) : (
          <div className="space-y-3">
            {displayed.map(issue => (
              <IssueCard
                key={`${issue._owner}/${issue._repo}#${issue.number}`}
                issue={issue}
                onReplyPosted={load}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
