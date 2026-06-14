import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Target, Save, LoaderCircle, Thermometer, Check, Power, History, AlertTriangle,
} from 'lucide-react';
import TopNav from '../components/TopNav';
import AcSchedule from '../components/AcSchedule';
import { supabase } from '../lib/supabase';

// Master kill-switch: when ON, the Pi executor applies this dashboard schedule
// to the AC. When OFF (default), the executor does nothing and the AC is under
// manual / SmartHQ control. Persisted to ac_preferences.executor_enabled.
function ControlToggle() {
  const [enabled, setEnabled] = useState(null); // null = loading
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('ac_preferences')
      .select('executor_enabled')
      .eq('id', 1)
      .limit(1);
    setEnabled(Boolean(data?.[0]?.executor_enabled));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setSaving(true);
    setEnabled(next); // optimistic
    await supabase
      .from('ac_preferences')
      .update({ executor_enabled: next, updated_at: new Date().toISOString() })
      .eq('id', 1);
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Power size={16} className={enabled ? 'text-emerald-400' : 'text-zinc-500'} />
          <span className="text-sm font-semibold text-zinc-100">Dashboard controls the AC</span>
        </div>
        <button
          onClick={toggle}
          disabled={saving || enabled === null}
          role="switch"
          aria-checked={!!enabled}
          className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? 'bg-emerald-500' : 'bg-zinc-700'
          }`}
          title={enabled ? 'On — click to disable' : 'Off — click to enable'}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {enabled === null ? (
        <p className="text-xs text-zinc-600 mt-2">Loading…</p>
      ) : enabled ? (
        <p className="text-xs text-amber-400/90 mt-2 leading-relaxed flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          The executor will apply the schedule below to your AC at each entry&apos;s time. Make sure
          SmartHQ&apos;s own schedule is turned OFF so the two don&apos;t fight.
        </p>
      ) : (
        <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
          The AC is under your manual / SmartHQ control — the executor won&apos;t touch it. Turn this
          on once you&apos;re ready for the dashboard schedule to drive the unit.
        </p>
      )}
    </div>
  );
}

// Audit trail of every change pushed to the AC / schedule, from any source.
function ChangeLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase
      .from('ac_change_log')
      .select('ts,source,action,detail,reason')
      .order('ts', { ascending: false })
      .limit(25);
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const tone = {
    executor: 'text-cyan-400 border-cyan-500/30',
    agent: 'text-violet-400 border-violet-500/30',
    manual: 'text-zinc-400 border-zinc-600/40',
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <History size={16} className="text-zinc-400" />
        <span className="text-sm font-semibold text-zinc-100">Change Log</span>
        <button onClick={load} className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-300">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-zinc-500 py-2">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-zinc-500 py-2">
          No changes logged yet. Pushes from the executor or the agent will show up here.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${tone[r.source] || tone.manual}`}>
                  {r.source}
                </span>
                <span className="text-zinc-100">{r.detail || r.action}</span>
                <span className="text-[11px] text-zinc-600 ml-auto">
                  {new Date(r.ts).toLocaleString()}
                </span>
              </div>
              {r.reason && <div className="text-xs text-zinc-500 mt-1 leading-relaxed">{r.reason}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Free-text "what I actually want" box, persisted to ac_preferences.goals_text.
// The advisor reads it on each analysis, so Luke's intent is weighed alongside
// the sensor data.
function GoalsBox() {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState('');   // last-saved value, to detect dirt
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('ac_preferences')
      .select('goals_text')
      .eq('id', 1)
      .limit(1);
    const g = data?.[0]?.goals_text ?? '';
    setText(g);
    setLoaded(g);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    await supabase
      .from('ac_preferences')
      .update({ goals_text: text, updated_at: new Date().toISOString() })
      .eq('id', 1);
    setLoaded(text);
    setSavedAt(new Date());
    setSaving(false);
  }

  const dirty = text !== loaded;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-violet-400" />
          <span className="text-sm font-semibold text-zinc-100">Your Goals</span>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="text-xs px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors min-h-[36px] flex items-center gap-1.5 disabled:opacity-50"
        >
          {saving ? (
            <><LoaderCircle size={13} className="animate-spin" /> Saving…</>
          ) : dirty ? (
            <><Save size={13} /> Save</>
          ) : (
            <><Check size={13} /> Saved</>
          )}
        </button>
      </div>

      <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
        Describe what you want in plain language — the advisor weighs this heavily when recommending
        changes. e.g. &ldquo;Bedroom 65°F overnight for sleep. Living room ~75°F during the day. I leave
        for the gym around 5:30pm and it&apos;s just the cats after, so warmer is fine in the evening.&rdquo;
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Type your desired temperatures, routine, and any constraints…"
        className="w-full bg-zinc-950/60 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2.5 text-sm leading-relaxed resize-y focus:outline-none focus:border-violet-500/60 placeholder:text-zinc-600"
      />

      <div className="flex items-center gap-2 mt-2 min-h-[16px]">
        {dirty && <span className="text-[11px] text-violet-400">Unsaved changes</span>}
        {!dirty && savedAt && (
          <span className="text-[11px] text-zinc-600">Saved {savedAt.toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  );
}

export default function Climate() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <TopNav />
      <main className="max-w-5xl mx-auto px-4 pb-12">
        <header className="mt-6 mb-5 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Climate</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              AC schedule, goals &amp; AI recommendations for the GE AWFS12WW
            </p>
          </div>
          <Link
            to="/thermometers"
            className="text-xs px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-colors min-h-[36px] flex items-center gap-1.5"
          >
            <Thermometer size={13} /> Thermometers
          </Link>
        </header>

        <ControlToggle />
        <GoalsBox />
        <AcSchedule />
        <ChangeLog />
      </main>
    </div>
  );
}
