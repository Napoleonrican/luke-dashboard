import { useState } from 'react';
import {
  ChevronDown, ChevronUp, Send, Bot, User, CircleDot,
  Check, PauseCircle, Rocket, Lightbulb, History, Loader, ArrowRight, Clock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Projects tab — the major initiatives in flight, not one-row-per-repo. Reads
// like the Inbox: title + blurb collapsed; expand for the human detail (last
// done / in progress / next) and a chat thread so Luke can ask a question right
// on the project. Sorted OLDEST-activity-first so stalled work surfaces on top.

const STATUS = {
  active:  { Icon: Loader,      dot: 'bg-emerald-500', color: 'text-emerald-400', label: 'Active' },
  paused:  { Icon: PauseCircle, dot: 'bg-amber-500',   color: 'text-amber-400',   label: 'Paused' },
  shipped: { Icon: Rocket,      dot: 'bg-sky-500',     color: 'text-sky-400',     label: 'Shipped' },
  idea:    { Icon: Lightbulb,   dot: 'bg-zinc-500',    color: 'text-zinc-400',    label: 'Idea' },
};

const DRIVER = {
  agents: 'Agents',
  luke:   'You',
  collab: 'You + Claude',
};

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function ago(iso) {
  const d = daysSince(iso);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function DetailRow({ Icon, label, text, accent }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon size={13} className={`flex-shrink-0 mt-0.5 ${accent}`} />
      <div className="min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">{label} </span>
        <span className="text-xs text-zinc-300 leading-relaxed">{text}</span>
      </div>
    </div>
  );
}

function Project({ project, messages, reload }) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply]       = useState('');
  const [posting, setPosting]   = useState(false);

  const st = STATUS[project.status] || STATUS.active;
  const St = st.Icon;
  const stale = project.status !== 'shipped' && daysSince(project.last_activity_at) >= 14;

  async function postReply() {
    if (!reply.trim() || !supabase) return;
    setPosting(true);
    // Luke's question lands unsynced; the Sidekick picks it up on its next run,
    // routes it (answers, or hands it to the Builder/Reviewer), and replies back.
    await supabase.from('mc_messages').insert({
      project_id: project.id, author: 'luke', body: reply.trim(), synced: false,
    });
    // Bump activity so an answered project doesn't keep reading as stale.
    await supabase.from('mc_projects')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', project.id);
    setReply('');
    setPosting(false);
    reload();
  }

  return (
    <div className={`bg-zinc-900 border rounded-xl overflow-hidden ${stale ? 'border-amber-800/50' : 'border-zinc-800'}`}>
      {/* Header */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${st.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-sm font-medium text-zinc-100">{project.title}</span>
            {stale && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-900/40 text-amber-300">
                stalled
              </span>
            )}
          </div>
          {project.blurb && <p className="text-xs text-zinc-500 leading-snug">{project.blurb}</p>}
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-medium flex items-center gap-1 ${st.color}`}>
              <St size={10} /> {st.label}
            </span>
            <span className="text-[10px] text-zinc-600">· {DRIVER[project.driver] || project.driver}</span>
            <span className="text-[10px] text-zinc-600">· {ago(project.last_activity_at)}</span>
          </div>
        </div>
        {expanded ? <ChevronUp size={13} className="text-zinc-600 mt-0.5" /> : <ChevronDown size={13} className="text-zinc-600 mt-0.5" />}
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
          <div className="space-y-2">
            <DetailRow Icon={History}   label="Last done"   text={project.last_done} accent="text-zinc-500" />
            <DetailRow Icon={CircleDot}  label="In progress" text={project.current}   accent="text-emerald-400" />
            <DetailRow Icon={ArrowRight} label="Next"        text={project.next_step} accent="text-cyan-400" />
          </div>

          {project.repos && (
            <p className="text-[10px] text-zinc-700">{project.repos}</p>
          )}

          {/* Conversation */}
          {messages.length > 0 && (
            <div className="space-y-2.5 pt-1">
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
                      {m.body}
                      <div className="text-[9px] text-zinc-600 mt-1">
                        {mine ? 'You' : 'Sidekick'} · {ago(m.created_at)}
                        {mine && !m.synced && <span className="text-amber-500/70"> · sending…</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ask a question */}
          <div>
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder="Ask about this project, or nudge it forward…"
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 placeholder-zinc-600 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none"
            />
            <div className="flex items-center justify-end mt-1.5">
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
  );
}

export default function ProjectsTab({ projects, messages, reload }) {
  const [showShipped, setShowShipped] = useState(false);

  const byProject = (id) => messages.filter(m => m.project_id === id);
  // Oldest activity first — stalled work rises to the top as a reminder.
  const sorted = [...projects].sort(
    (a, b) => new Date(a.last_activity_at) - new Date(b.last_activity_at)
  );
  const live    = sorted.filter(p => p.status !== 'shipped');
  const shipped = sorted.filter(p => p.status === 'shipped');

  if (projects.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-600 text-sm">
        No projects yet — your Sidekick will fill these in on its next sweep.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {live.map(p => <Project key={p.id} project={p} messages={byProject(p.id)} reload={reload} />)}

      {shipped.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowShipped(s => !s)}
            className="flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors mb-2"
          >
            <Clock size={11} />
            {showShipped ? 'Hide' : 'Show'} shipped ({shipped.length})
            {showShipped ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {showShipped && (
            <div className="space-y-3">
              {shipped.map(p => <Project key={p.id} project={p} messages={byProject(p.id)} reload={reload} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
