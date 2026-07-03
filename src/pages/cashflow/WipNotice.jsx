import { FlaskConical } from 'lucide-react';

// A small, honest "this tab isn't final yet" banner for the Cashflow tabs that
// are still being built out (Waterfall, Runway, Inputs). Amber so it reads as a
// caution without alarming. Wording is passed per-tab because the tabs are at
// different stages — some now pull live data but aren't feature-complete, so a
// blanket "demo data" label would be inaccurate. Remove a tab's notice once it's
// fully wired and final. Light-theme contrast handled in cashflow-theme.css
// (.cf-wip override) so the amber stays legible on the white card background.
export default function WipNotice({ children }) {
  return (
    <div className="cf-wip flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-[13px] leading-snug text-amber-300">
      <FlaskConical size={15} className="mt-0.5 shrink-0 text-amber-400" />
      <span>{children}</span>
    </div>
  );
}
