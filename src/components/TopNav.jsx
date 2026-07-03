import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// `title`/`subtitle` let a page fold its own header into this bar instead of
// stacking a second one below — the title sits centered, and `subtitle`
// becomes a native hover tooltip rather than always-visible text. Omit both
// for the plain "Back to Hub … Luke's Dashboard" bar every other page uses.
export default function TopNav({ title, subtitle, right }) {
  if (title) {
    return (
      <nav className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-4 border-b border-zinc-800/60">
        <Link
          to="/"
          className="justify-self-start inline-flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft size={14} />
          Back to Hub
        </Link>
        <span
          className="justify-self-center text-sm font-semibold text-zinc-200 tracking-wide text-center cursor-default"
          title={subtitle}
        >
          {title}
        </span>
        <span className="justify-self-end">{right}</span>
      </nav>
    );
  }

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm"
      >
        <ArrowLeft size={14} />
        Back to Hub
      </Link>
      <span className="text-xs text-zinc-600 tracking-wide">Luke's Dashboard</span>
    </nav>
  );
}
