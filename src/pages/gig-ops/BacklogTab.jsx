import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw, Lightbulb, X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { COLLAB_AUTHOR } from '../../lib/authConfig';
import Markdown from '../mission-control/Markdown';

// Plain-language versions of BACKLOG.md's own columns, so what she picks maps
// onto the vocabulary the file (and the agents) already use.
const VALUE_OPTIONS = [
  { value: '⭐',       label: 'Nice to have' },
  { value: '⭐⭐',     label: 'Useful' },
  { value: '⭐⭐⭐',   label: 'Important' },
  { value: '⭐⭐⭐⭐', label: 'Big deal' },
];

const TIER_OPTIONS = [
  { value: 'All',           label: 'Everyone, including free' },
  { value: 'Side Hustler',  label: 'Side Hustler (paid)' },
  { value: 'Full-timer',    label: 'Full-Timer (top tier)' },
  { value: 'Unsure',        label: "Not sure — you decide" },
];

const BLANK = { title: '', why: '', value: '⭐⭐', tier: 'All', where: '' };

// Her suggestion becomes an mc_threads row the Sidekick picks up, titled with a
// "[Backlog idea]" marker so the routine knows to file it as a gig-tracker
// `enhancement` issue rather than answer it as a question. From there it flows
// through the existing Monday proposal-editorial pass, where Luke promotes or
// declines it — so she can propose freely without anything auto-entering the
// build queue. See docs/sidekick-gig-ops-patch.md.
function SuggestModal({ onClose, onSaved }) {
  const [form, setForm]     = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const canSave = form.title.trim() && form.why.trim() && !saving;

  async function save() {
    if (!canSave || !supabase) return;
    setSaving(true);
    setError('');
    const body = [
      `**Backlog suggestion from Miranda**`,
      ``,
      `**What she'd like to see:** ${form.title.trim()}`,
      ``,
      `**Why it matters / what problem it solves:**`,
      form.why.trim(),
      ``,
      `**How big a deal she thinks it is:** ${form.value}`,
      `**Who she thinks it's for:** ${form.tier === 'Unsure' ? 'Not sure — Luke to decide' : form.tier}`,
      form.where.trim() ? `**Where in the app:** ${form.where.trim()}` : null,
      ``,
      `_Suggested via the Gig Ops page. Not approved — for Luke's review._`,
    ].filter((l) => l !== null).join('\n');

    try {
      const { data: thread, error: tErr } = await supabase.from('mc_threads').insert({
        repo: 'gig-tracker',
        title: `[Backlog idea] ${form.title.trim()}`,
        summary: form.why.trim().slice(0, 400),
        category: 'fyi',
        severity: 'low',
        status: 'waiting_on_agent',
      }).select().single();
      if (tErr) throw new Error(tErr.message);
      const { error: mErr } = await supabase.from('mc_messages').insert({
        thread_id: thread.id, author: COLLAB_AUTHOR, body, synced: false,
      });
      if (mErr) throw new Error(mErr.message);
      setSaving(false);
      onSaved();
      onClose();
    } catch (e) {
      setSaving(false);
      setError(e.message || 'Could not save that — try again.');
    }
  }

  const field = 'w-full bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder-zinc-600 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-zinc-200">Suggest something for the backlog</h2>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={14} /></button>
        </div>
        <p className="text-[11px] text-zinc-500 mb-4">
          Describe it however makes sense to you — the assistant writes it up properly and adds it
          to the list for Luke to look at.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              What would you like to see? <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Remind me to take a break after 3 hours"
              className={`${field} text-sm`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Why does it matter? <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.why}
              onChange={(e) => setForm((f) => ({ ...f, why: e.target.value }))}
              placeholder="What's annoying or missing today, and what would be better?"
              rows={4}
              className={`${field} text-xs resize-none`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">How big a deal is it?</label>
            <select
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              className={`${field} text-xs`}
            >
              {VALUE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.value} — {o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">Who should get it?</label>
            <select
              value={form.tier}
              onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}
              className={`${field} text-xs`}
            >
              {TIER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Where in the app? <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              value={form.where}
              onChange={(e) => setForm((f) => ({ ...f, where: e.target.value }))}
              placeholder="e.g. the main screen during a shift"
              className={`${field} text-xs`}
            />
          </div>

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded px-4 py-1.5 flex items-center gap-1.5 transition-colors"
            >
              <Check size={11} /> {saving ? 'Sending…' : 'Send suggestion'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BacklogTab() {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [sent, setSent]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/gig-ops-backlog');
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
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-zinc-500 leading-relaxed">
          The project's full to-do list, live from the file the assistants actually work from.
          Rows marked 🧑 or 👥 need a person's call; ✅ means it's already built.
        </p>
        <button
          onClick={() => setSuggesting(true)}
          disabled={!supabase}
          className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded px-3 py-1.5 transition-colors flex-shrink-0"
        >
          <Lightbulb size={13} /> Suggest an item
        </button>
      </div>

      {sent && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2.5 text-xs text-emerald-300">
          <Check size={14} className="shrink-0 mt-0.5" />
          <span>
            Sent. The assistant will write it up and add it to the list — you'll get a reply on the
            Decisions &amp; Inbox tab.
          </span>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-200">Full backlog</h3>
          <button
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="px-4 py-3">
          {loading ? (
            <p className="text-xs text-zinc-600 text-center py-10">Loading…</p>
          ) : error ? (
            <div className="flex items-start gap-2 text-xs text-amber-300">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          ) : (
            <Markdown className="text-xs text-zinc-400">{markdown}</Markdown>
          )}
        </div>
      </div>

      {suggesting && (
        <SuggestModal onClose={() => setSuggesting(false)} onSaved={() => setSent(true)} />
      )}
    </div>
  );
}
