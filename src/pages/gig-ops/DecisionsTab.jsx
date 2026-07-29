import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown, ChevronUp, Send, ExternalLink, AlertTriangle,
  ShieldAlert, CircleDot, CheckCircle2, Clock, Bot, User, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Markdown from '../mission-control/Markdown';

const CATEGORY = {
  security:  { Icon: ShieldAlert,   color: 'text-red-400',    label: 'Security' },
  action:    { Icon: CircleDot,     color: 'text-amber-400',  label: 'Action' },
  attention: { Icon: AlertTriangle, color: 'text-amber-400',  label: 'Attention' },
  fyi:       { Icon: CircleDot,     color: 'text-zinc-400',   label: 'FYI' },
};

const STATUS = {
  needs_you:        { label: 'Needs a decision', badge: 'bg-amber-900/40 text-amber-300' },
  waiting_on_agent: { label: 'Answered — with the agents', badge: 'bg-blue-900/40 text-blue-300' },
  resolved:         { label: 'Resolved',          badge: 'bg-green-900/40 text-green-300' },
};

function timeAgo(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Thread({ thread, messages, reload, authorLabel }) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply]       = useState('');
  const [posting, setPosting]   = useState(false);
  const [error, setError]       = useState('');

  const cat = CATEGORY[thread.category] || CATEGORY.attention;
  const st  = STATUS[thread.status] || STATUS.needs_you;
  const Cat = cat.Icon;

  async function postReply(markResolved = false) {
    if (!reply.trim() || posting) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetch('/api/gig-ops-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: thread.id, replyText: reply.trim(), authorLabel, markResolved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send.');
      setReply('');
      reload();
    } catch (e) {
      setError(e.message || 'Failed to send — try again.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <Cat size={15} className={`flex-shrink-0 mt-0.5 ${cat.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {thread.github_issue && <span className="text-[10px] text-zinc-600">#{thread.github_issue}</span>}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${st.badge}`}>{st.label}</span>
          </div>
          <p className={`text-sm leading-snug ${thread.status === 'resolved' ? 'text-zinc-400' : 'text-zinc-100'}`}>
            {thread.title}
          </p>
          <span className="text-[10px] text-zinc-600">{timeAgo(thread.updated_at)}</span>
        </div>
        {expanded ? <ChevronUp size={13} className="text-zinc-600 mt-0.5" /> : <ChevronDown size={13} className="text-zinc-600 mt-0.5" />}
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
          {thread.summary && <Markdown className="text-xs text-zinc-400">{thread.summary}</Markdown>}

          {thread.action && (
            <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2.5">
              <CircleDot size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold text-amber-300 uppercase tracking-wide mb-0.5">What's needed</p>
                <Markdown className="text-xs text-amber-100/90">{thread.action}</Markdown>
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div className="space-y-2.5">
              {messages.map(m => {
                const mine = m.author !== 'sidekick';
                return (
                  <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex-shrink-0 mt-0.5 ${mine ? 'text-emerald-400' : 'text-cyan-400'}`}>
                      {mine ? <User size={13} /> : <Bot size={13} />}
                    </div>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      mine ? 'bg-emerald-900/25 text-emerald-50/90' : 'bg-zinc-800 text-zinc-300'
                    }`}>
                      <Markdown>{m.body}</Markdown>
                      <div className="text-[9px] text-zinc-600 mt-1">
                        {mine ? m.author : 'Sidekick'} · {timeAgo(m.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {thread.status !== 'resolved' && (
            <div>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Type your answer — it posts straight to the GitHub issue…"
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 placeholder-zinc-600 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none"
              />
              {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
              <div className="flex items-center justify-between mt-1.5">
                <button
                  onClick={() => postReply(true)}
                  disabled={posting || !reply.trim()}
                  className="text-[11px] text-zinc-600 hover:text-green-400 transition-colors flex items-center gap-1 disabled:opacity-40"
                >
                  <CheckCircle2 size={11} /> Answer &amp; mark resolved
                </button>
                <div className="flex items-center gap-2">
                  {thread.github_url && (
                    <a
                      href={thread.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors flex items-center gap-1"
                    >
                      <ExternalLink size={10} /> Detail
                    </a>
                  )}
                  <button
                    onClick={() => postReply(false)}
                    disabled={posting || !reply.trim()}
                    className="text-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded px-3 py-1 flex items-center gap-1 transition-colors"
                  >
                    <Send size={10} /> {posting ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BacklogPanel() {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/gig-ops-reply?action=backlog');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load the backlog.');
      setMarkdown(data.markdown || '');
    } catch (e) {
      setError(e.message || 'Could not load the backlog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Full backlog</h3>
          <p className="text-[11px] text-zinc-600 mt-0.5">
            Live from the project's BACKLOG.md — 🧑 and 👥 rows are items that need a human call.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="px-4 py-3 max-h-[32rem] overflow-y-auto">
        {loading ? (
          <p className="text-xs text-zinc-600 text-center py-8">Loading…</p>
        ) : error ? (
          <div className="flex items-start gap-2 text-xs text-amber-300">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" /> {error}
          </div>
        ) : (
          <Markdown className="text-xs text-zinc-400">{markdown}</Markdown>
        )}
      </div>
    </div>
  );
}

export default function DecisionsTab({ session }) {
  const [threads, setThreads]   = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(!!supabase);
  const [showResolved, setShowResolved] = useState(false);

  const authorLabel = session?.user?.email || 'collaborator';

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [{ data: t }, { data: m }] = await Promise.all([
      supabase.from('mc_threads').select('*').eq('repo', 'gig-tracker').order('updated_at', { ascending: false }),
      supabase.from('mc_messages').select('*').order('created_at', { ascending: true }),
    ]);
    setThreads(t || []);
    setMessages(m || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const byThread = (id) => messages.filter(m => m.thread_id === id);
  const open     = threads.filter(t => t.status !== 'resolved');
  const resolved = threads.filter(t => t.status === 'resolved');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
          Needs a decision {open.length > 0 && `(${open.length})`}
        </h2>
        {loading ? (
          <p className="text-center py-10 text-zinc-600 text-sm">Loading…</p>
        ) : open.length === 0 ? (
          <div className="text-center py-10 bg-zinc-900 border border-zinc-800 rounded-xl">
            <CheckCircle2 size={26} className="text-green-500/70 mx-auto mb-2" />
            <p className="text-sm text-zinc-400">Nothing needs a decision right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {open.map(t => <Thread key={t.id} thread={t} messages={byThread(t.id)} reload={load} authorLabel={authorLabel} />)}
          </div>
        )}

        {resolved.length > 0 && (
          <div className="pt-3">
            <button
              onClick={() => setShowResolved(s => !s)}
              className="flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors mb-2"
            >
              <Clock size={11} /> {showResolved ? 'Hide' : 'Show'} resolved ({resolved.length})
              {showResolved ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {showResolved && (
              <div className="space-y-3">
                {resolved.map(t => <Thread key={t.id} thread={t} messages={byThread(t.id)} reload={load} authorLabel={authorLabel} />)}
              </div>
            )}
          </div>
        )}
      </div>

      <BacklogPanel />
    </div>
  );
}
