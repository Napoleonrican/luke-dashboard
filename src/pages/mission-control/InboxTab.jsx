import { useState, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, Send, ExternalLink, AlertTriangle,
  ShieldAlert, CircleDot, CheckCircle2, Clock, Bot, User, Plus, X, Check,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Markdown from './Markdown';

const CATEGORY = {
  security:  { Icon: ShieldAlert,   color: 'text-red-400',    label: 'Security' },
  action:    { Icon: CircleDot,     color: 'text-amber-400',  label: 'Action' },
  attention: { Icon: AlertTriangle, color: 'text-amber-400',  label: 'Attention' },
  fyi:       { Icon: CircleDot,     color: 'text-zinc-400',   label: 'FYI' },
};

const STATUS = {
  needs_you:        { label: 'Needs you',    badge: 'bg-amber-900/40 text-amber-300' },
  waiting_on_agent: { label: 'With Sidekick', badge: 'bg-blue-900/40 text-blue-300' },
  resolved:         { label: 'Resolved',     badge: 'bg-green-900/40 text-green-300' },
};

// Priority rides on the existing mc_threads.severity column (urgent | normal | low)
// so this needs no schema change — it just presents that field as the same
// three-tier priority Luke already uses on the Backlog tab.
const PRIORITY = {
  urgent: { label: 'High',   badge: 'bg-red-900/40 text-red-300' },
  normal: { label: 'Medium', badge: 'bg-yellow-900/40 text-yellow-300' },
  low:    { label: 'Low',    badge: 'bg-green-900/40 text-green-300' },
};

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: '🔴 High' },
  { value: 'normal', label: '🟡 Medium' },
  { value: 'low',    label: '🟢 Low' },
];

// Known projects for the compose dropdown; "Other…" reveals a free-text field so
// Luke can start a thread for a brand-new project that has no repo yet.
const PROJECTS = [
  'personal-assistant', 'luke-dashboard', 'gig-tracker',
  'gas-price-forecast', 'daily-planner', 'ac-schedule-agent',
];

const BLANK_COMPOSE = { title: '', details: '', repo: 'personal-assistant', otherRepo: '', priority: 'normal' };

function timeAgo(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Thread({ thread, messages, reload }) {
  const [expanded, setExpanded] = useState(thread.status !== 'resolved');
  const [reply, setReply]       = useState('');
  const [posting, setPosting]   = useState(false);

  const cat = CATEGORY[thread.category] || CATEGORY.attention;
  const st  = STATUS[thread.status] || STATUS.needs_you;
  const pr  = PRIORITY[thread.severity] || PRIORITY.normal;
  const Cat = cat.Icon;

  async function postReply() {
    if (!reply.trim() || !supabase) return;
    setPosting(true);
    // Luke's reply lands unsynced; the Sidekick routine picks it up, acts, and
    // flips status to waiting_on_agent / resolved on its next run.
    await supabase.from('mc_messages').insert({
      thread_id: thread.id, author: 'luke', body: reply.trim(), synced: false,
    });
    await supabase.from('mc_threads').update({ status: 'waiting_on_agent' }).eq('id', thread.id);
    setReply('');
    setPosting(false);
    reload();
  }

  async function markResolved() {
    if (!supabase) return;
    await supabase.from('mc_threads').update({ status: 'resolved' }).eq('id', thread.id);
    reload();
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <Cat size={15} className={`flex-shrink-0 mt-0.5 ${cat.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="text-[10px] text-zinc-600">{thread.repo}</span>
            {thread.github_issue && <span className="text-[10px] text-zinc-600">#{thread.github_issue}</span>}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${pr.badge}`}>{pr.label}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${st.badge}`}>{st.label}</span>
          </div>
          <p className={`text-sm leading-snug ${thread.status === 'resolved' ? 'text-zinc-400' : 'text-zinc-100'}`}>
            {thread.title}
          </p>
          <span className="text-[10px] text-zinc-600">{timeAgo(thread.updated_at)}</span>
        </div>
        {expanded ? <ChevronUp size={13} className="text-zinc-600 mt-0.5" /> : <ChevronDown size={13} className="text-zinc-600 mt-0.5" />}
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
          {thread.summary && (
            <Markdown className="text-xs text-zinc-400">{thread.summary}</Markdown>
          )}

          {/* The explicit ask */}
          {thread.action && (
            <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2.5">
              <CircleDot size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold text-amber-300 uppercase tracking-wide mb-0.5">What to do</p>
                <Markdown className="text-xs text-amber-100/90">{thread.action}</Markdown>
              </div>
            </div>
          )}

          {/* Conversation */}
          {messages.length > 0 && (
            <div className="space-y-2.5">
              {messages.map(m => {
                const mine = m.author === 'luke';
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
                        {mine ? 'You' : 'Sidekick'} · {timeAgo(m.created_at)}
                        {mine && !m.synced && <span className="text-amber-500/70"> · sending…</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Reply */}
          {thread.status !== 'resolved' && (
            <div>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Reply to your Sidekick…"
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 placeholder-zinc-600 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none"
              />
              <div className="flex items-center justify-between mt-1.5">
                <button
                  onClick={markResolved}
                  className="text-[11px] text-zinc-600 hover:text-green-400 transition-colors flex items-center gap-1"
                >
                  <CheckCircle2 size={11} /> Mark resolved
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
                    onClick={postReply}
                    disabled={posting || !reply.trim() || !supabase}
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

// Compose modal — Luke starts his own thread. It lands as a waiting_on_agent
// thread with an unsynced opening message (author 'luke'), the same shape the
// Sidekick routine already watches for when Luke replies, so it gets picked up
// and acted on just like a reply does.
function ComposeModal({ onClose, reload }) {
  const [form, setForm]     = useState(BLANK_COMPOSE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const repo = form.repo === '__other__' ? form.otherRepo.trim() : form.repo;
  const canSave = form.title.trim() && repo && !saving;

  async function create() {
    if (!canSave || !supabase) return;
    setSaving(true);
    const { data: thread } = await supabase.from('mc_threads').insert({
      repo,
      title: form.title.trim(),
      category: 'action',
      severity: form.priority,   // priority rides on severity — see PRIORITY map above
      status: 'waiting_on_agent',
    }).select().single();
    if (thread && form.details.trim()) {
      await supabase.from('mc_messages').insert({
        thread_id: thread.id, author: 'luke', body: form.details.trim(), synced: false,
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
            placeholder="Details for your Sidekick — what you'd like done… (Markdown supported)"
            rows={4}
            className="w-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 placeholder-zinc-600 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none"
          />
          <div className="flex gap-2">
            <select
              value={form.repo}
              onChange={e => setForm(f => ({ ...f, repo: e.target.value }))}
              className="flex-1 min-w-0 text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1.5 focus:outline-none"
            >
              {PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
              <option value="__other__">Other…</option>
            </select>
            <select
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              className="flex-1 min-w-0 text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1.5 focus:outline-none"
            >
              {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {form.repo === '__other__' && (
            <input
              value={form.otherRepo}
              onChange={e => setForm(f => ({ ...f, otherRepo: e.target.value }))}
              placeholder="New project name…"
              className="w-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 placeholder-zinc-600 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          )}
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

export default function InboxTab({ threads, messages, reload }) {
  const [showResolved, setShowResolved] = useState(false);
  const [composing, setComposing]       = useState(false);

  const byThread = (id) => messages.filter(m => m.thread_id === id);
  const open     = threads.filter(t => t.status !== 'resolved');
  const resolved = threads.filter(t => t.status === 'resolved');

  return (
    <div className="space-y-3">
      {/* Start-your-own-thread control */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Start a thread and your Sidekick picks it up — for a new project or anything you want handled.
        </p>
        <button
          onClick={() => setComposing(true)}
          disabled={!supabase}
          title={supabase ? undefined : 'Not connected — reconnect to start a thread'}
          className="flex items-center gap-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded px-3 py-1.5 transition-colors flex-shrink-0 ml-3"
        >
          <Plus size={13} /> New thread
        </button>
      </div>

      {open.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 size={28} className="text-green-500/70 mx-auto mb-2" />
          <p className="text-sm text-zinc-400">You're all caught up.</p>
          <p className="text-xs text-zinc-600 mt-0.5">Nothing needs your attention right now.</p>
        </div>
      ) : (
        open.map(t => <Thread key={t.id} thread={t} messages={byThread(t.id)} reload={reload} />)
      )}

      {resolved.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowResolved(s => !s)}
            className="flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors mb-2"
          >
            <Clock size={11} />
            {showResolved ? 'Hide' : 'Show'} resolved ({resolved.length})
            {showResolved ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {showResolved && (
            <div className="space-y-3">
              {resolved.map(t => <Thread key={t.id} thread={t} messages={byThread(t.id)} reload={reload} />)}
            </div>
          )}
        </div>
      )}

      {composing && <ComposeModal onClose={() => setComposing(false)} reload={reload} />}
    </div>
  );
}
