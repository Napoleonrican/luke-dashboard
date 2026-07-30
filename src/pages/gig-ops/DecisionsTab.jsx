import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown, ChevronUp, Send, ExternalLink, SlidersHorizontal,
  ShieldAlert, CircleDot, AlertTriangle, CheckCircle2, Clock, Bot, User, Plus, X, Check,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Markdown from '../mission-control/Markdown';
import { authorLabel, isAgentAuthor, COLLAB_AUTHOR } from '../../lib/authConfig';

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: '🔴 High' },
  { value: 'normal', label: '🟡 Medium' },
  { value: 'low',    label: '🟢 Low' },
];

const BLANK_COMPOSE = { title: '', details: '', priority: 'normal' };

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

function Thread({ thread, messages, reload }) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply]       = useState('');
  const [posting, setPosting]   = useState(false);
  const [error, setError]       = useState('');

  const cat = CATEGORY[thread.category] || CATEGORY.attention;
  const st  = STATUS[thread.status] || STATUS.needs_you;
  const Cat = cat.Icon;

  // Her reply lands unsynced, exactly like Luke's own replies do on his
  // Inbox: the Sidekick routine picks up unsynced non-sidekick messages,
  // interprets them, and speaks to the GitHub issue in the worker agents'
  // terms. Nothing here posts to GitHub directly — the agent is the relay.
  async function postReply() {
    if (!reply.trim() || posting || !supabase) return;
    setPosting(true);
    setError('');
    try {
      const { error: msgErr } = await supabase.from('mc_messages').insert({
        thread_id: thread.id, author: COLLAB_AUTHOR, body: reply.trim(), synced: false,
      });
      if (msgErr) throw new Error(msgErr.message);
      await supabase.from('mc_threads').update({ status: 'waiting_on_agent' }).eq('id', thread.id);
      setReply('');
      reload();
    } catch (e) {
      setError(e.message || 'Could not send — try again.');
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
                // Her own messages sit right; the assistant and Luke sit left,
                // each named — so she can tell who said what.
                const mine    = m.author === COLLAB_AUTHOR;
                const isAgent = isAgentAuthor(m.author);
                return (
                  <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex-shrink-0 mt-0.5 ${
                      mine ? 'text-emerald-400' : isAgent ? 'text-cyan-400' : 'text-violet-400'
                    }`}>
                      {isAgent ? <Bot size={13} /> : <User size={13} />}
                    </div>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      mine ? 'bg-emerald-900/25 text-emerald-50/90' : 'bg-zinc-800 text-zinc-300'
                    }`}>
                      <Markdown>{m.body}</Markdown>
                      <div className="text-[9px] text-zinc-600 mt-1">
                        {authorLabel(m.author, COLLAB_AUTHOR)} · {timeAgo(m.created_at)}
                        {mine && !m.synced && (
                          <span
                            className="text-amber-500/70"
                            title="Saved. The assistant reads it on its next check — nothing more for you to do."
                          > · with the assistant</span>
                        )}
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
                placeholder="Type your answer in your own words…"
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 placeholder-zinc-600 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none"
              />
              {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-zinc-600">
                  Goes to the assistant, which passes it to the build team.
                </span>
                <button
                  onClick={postReply}
                  disabled={posting || !reply.trim()}
                  className="text-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded px-3 py-1 flex items-center gap-1 transition-colors"
                >
                  <Send size={10} /> {posting ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Lets her open her own thread, same as Luke's "New thread" on his own Inbox
// (InboxTab.jsx) — just fixed to repo: 'gig-tracker' since that's the only
// project this page ever touches. A fresh thread has no linked GitHub issue
// yet, so the Sidekick decides on its next run whether to file one, and
// replies to her either way.
function ComposeThreadModal({ onClose, reload }) {
  const [form, setForm]     = useState(BLANK_COMPOSE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const canSave = form.title.trim() && !saving;

  async function create() {
    if (!canSave || !supabase) return;
    setSaving(true);
    const { data: thread } = await supabase.from('mc_threads').insert({
      repo: 'gig-tracker',
      title: form.title.trim(),
      category: 'action',
      severity: form.priority,
      status: 'waiting_on_agent',
    }).select().single();
    if (thread && form.details.trim()) {
      await supabase.from('mc_messages').insert({
        thread_id: thread.id, author: COLLAB_AUTHOR, body: form.details.trim(), synced: false,
      });
    }
    setSaving(false);
    onClose();
    reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-200">New thread</h2>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={14} /></button>
        </div>
        <div className="space-y-3">
          <input
            autoFocus value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="What's this about?"
            className="w-full bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <textarea
            value={form.details}
            onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
            placeholder="Details — what would you like looked at or decided?"
            rows={4}
            className="w-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 placeholder-zinc-600 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none"
          />
          <select
            value={form.priority}
            onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
            className="w-full text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1.5 focus:outline-none"
          >
            {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5">Cancel</button>
            <button
              onClick={create}
              disabled={!canSave}
              className="text-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded px-4 py-1.5 flex items-center gap-1.5 transition-colors"
            >
              <Check size={11} /> {saving ? 'Starting…' : 'Start thread'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// The tier/pricing line is the single biggest unresolved decision on the
// project — it blocks backlog items 3.7, 3.8 and 6.4 on its own. Pricing Studio
// (/pricing-studio) already exists as a shareable, login-free tool for exactly
// this, so point her at it rather than reinventing it. Opens in a new tab so
// she doesn't lose her place here.
function PricingStudioCard() {
  return (
    <div className="rounded-xl border border-violet-800/50 bg-violet-950/20 p-4">
      <div className="flex items-center gap-2 mb-2">
        <SlidersHorizontal size={15} className="text-violet-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Help decide what's free and what's paid</h3>
      </div>
      <div className="text-xs text-zinc-400 leading-relaxed space-y-2">
        <p>
          This is the biggest open question on the project, and more work is waiting on it than
          on anything else. There's a tool built for it — every real feature of the app is a
          card, and you sort each one into the tier you think it belongs in.
        </p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Open <strong className="text-zinc-300">Pricing Studio</strong> below.</li>
          <li>Put your name at the top so Luke knows whose plan it is.</li>
          <li>Tap each feature into <strong className="text-zinc-300">Free</strong>, <strong className="text-zinc-300">Side Hustler</strong>, or <strong className="text-zinc-300">Full-Timer</strong>, and set what the paid tiers should cost.</li>
          <li>Hit <strong className="text-zinc-300">Copy my share link</strong> and text it to Luke.</li>
        </ol>
        <p className="text-zinc-500">
          No login, nothing to install, and your whole plan travels inside the link — so you can
          do it on your phone and it's saved just by keeping the link.
        </p>
      </div>
      <a
        href="/pricing-studio"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500"
      >
        Open Pricing Studio <ExternalLink size={11} />
      </a>
    </div>
  );
}

export default function DecisionsTab() {
  const [threads, setThreads]   = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(!!supabase);
  const [showResolved, setShowResolved] = useState(false);
  const [composing, setComposing] = useState(false);

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
      <PricingStudioCard />

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Needs a decision {open.length > 0 && `(${open.length})`}
          </h2>
          <button
            onClick={() => setComposing(true)}
            disabled={!supabase}
            className="flex items-center gap-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded px-3 py-1.5 transition-colors flex-shrink-0"
          >
            <Plus size={13} /> New thread
          </button>
        </div>
        {loading ? (
          <p className="text-center py-10 text-zinc-600 text-sm">Loading…</p>
        ) : open.length === 0 ? (
          <div className="text-center py-10 bg-zinc-900 border border-zinc-800 rounded-xl">
            <CheckCircle2 size={26} className="text-green-500/70 mx-auto mb-2" />
            <p className="text-sm text-zinc-400">Nothing needs a decision right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {open.map(t => <Thread key={t.id} thread={t} messages={byThread(t.id)} reload={load} />)}
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
                {resolved.map(t => <Thread key={t.id} thread={t} messages={byThread(t.id)} reload={load} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {composing && (
        <ComposeThreadModal onClose={() => setComposing(false)} reload={load} />
      )}
    </div>
  );
}
