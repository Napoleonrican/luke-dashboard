import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Redacted } from './CashflowLayout';
import { fetchInputs, upsertInput } from '../../lib/fin';
import EditCell from './EditCell';

// Inputs & Targets — the Cashflow "Inputs" sheet as editable config. Parked on
// its own tab for now; the Waterfall/Runway mappings that consume these values
// will be wired up later.
export default function Inputs() {
  const { privacy } = useOutletContext();
  const [inputs, setInputs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchInputs().then(({ data }) => { if (active) { if (data) setInputs(data); setLoading(false); } });
    return () => { active = false; };
  }, []);

  const updateValue = async (id, value) => {
    setInputs((prev) => prev.map((i) => i.id === id ? { ...i, value } : i));
    await upsertInput({ id, value });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Inputs &amp; Targets</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Config values from the Cashflow sheet. The Waterfall/Runway mappings come later.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-6 bg-zinc-800 rounded" style={{ opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        ) : inputs.length === 0 ? (
          <p className="text-sm text-zinc-600">No inputs yet — run the seed to load them.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {inputs.map((i) => (
              <div key={i.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <p className="text-[11px] text-zinc-500 leading-tight mb-1.5 truncate" title={i.label}>{i.label}</p>
                <Redacted on={privacy}>
                  <div className="flex items-baseline gap-1">
                    <EditCell value={i.value ?? 0} type="number" onSave={(v) => updateValue(i.id, v)} className="text-sm font-semibold tabular-nums text-zinc-200" />
                    {i.unit && <span className="text-[10px] text-zinc-600 font-normal">{i.unit}</span>}
                  </div>
                </Redacted>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
