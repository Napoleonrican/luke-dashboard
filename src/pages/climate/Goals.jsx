import { useState, useEffect, useCallback } from 'react';
import { Target, Save, LoaderCircle, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Free-text "what I actually want" box, persisted to ac_preferences.goals_text.
// The schedule agent reads this on every run — it's the authoritative statement of
// Luke's intent, weighed alongside the sensor data.
export default function Goals() {
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
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
        Describe what you want in plain language — the agent weighs this heavily when it tunes the
        schedule. e.g. &ldquo;Bedroom 65°F overnight for sleep. Living room ~75°F during the day. I leave
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
