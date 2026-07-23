// Markdown.jsx — a small, self-contained markdown renderer for Mission Control
// message bodies. Sidekick messages (mc_messages.body), thread summaries, and
// actions are authored in markdown, but the Inbox used to render them as one
// raw text block — headings, numbered/bulleted lists, bold, and paragraph
// spacing never showed up. This renders that subset to styled React elements.
//
// Deliberately dependency-free (no react-markdown / remark) to keep the bundle
// light and avoid pulling in a large transitive tree for a handful of message
// types. It builds React elements directly rather than setting innerHTML, so
// there is no HTML-injection surface even though the text originates from the
// Sidekick routine.
//
// Supported: ATX headings (#..######), unordered lists (-, *, +), ordered
// lists (1. 2. …), blockquotes (>), paragraphs, blank-line spacing, and the
// inline spans bold (**/__), italic (*/_), inline code (`), and links
// [text](url). Anything unrecognized is passed through as plain text.

// ---- inline parsing -------------------------------------------------------

// Ordered so the first match at a given position wins. Bold before italic so
// `**x**` isn't mistaken for two italics. Underscore emphasis requires
// non-word boundaries so snake_case identifiers common in Sidekick messages
// (mc_messages, ai_backlog_tasks, waiting_on_agent) are left untouched;
// asterisk emphasis has no such guard, matching how markdown normally treats
// intraword `_` vs `*`.
const INLINE_RULES = [
  { type: 'strong', re: /\*\*([^*]+)\*\*|(?<![A-Za-z0-9])__([^_]+)__(?![A-Za-z0-9])/ },
  { type: 'em',     re: /\*([^*\n]+)\*|(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/ },
  { type: 'code',   re: /`([^`]+)`/ },
  { type: 'link',   re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/ },
];

function isSafeHref(url) {
  return /^https?:\/\//i.test(url);
}

// Parse a single line of inline markdown into an array of React children.
function parseInline(text, keyPrefix = 'i') {
  if (!text) return [];
  const out = [];
  let rest = text;
  let guard = 0;

  while (rest && guard++ < 500) {
    // Find the earliest-matching rule in the remaining string.
    let best = null;
    for (const rule of INLINE_RULES) {
      const m = rule.re.exec(rest);
      if (m && (best === null || m.index < best.m.index)) best = { rule, m };
    }

    if (!best) {
      out.push(rest);
      break;
    }

    const { rule, m } = best;
    if (m.index > 0) out.push(rest.slice(0, m.index));

    const key = `${keyPrefix}-${out.length}`;
    if (rule.type === 'strong') {
      const inner = m[1] ?? m[2];
      out.push(<strong key={key} className="font-semibold text-inherit">{parseInline(inner, key)}</strong>);
    } else if (rule.type === 'em') {
      const inner = m[1] ?? m[2];
      out.push(<em key={key} className="italic">{parseInline(inner, key)}</em>);
    } else if (rule.type === 'code') {
      out.push(
        <code key={key} className="px-1 py-0.5 rounded bg-black/30 text-[0.9em] font-mono text-inherit">{m[1]}</code>
      );
    } else if (rule.type === 'link') {
      const [, label, url] = m;
      if (isSafeHref(url)) {
        out.push(
          <a key={key} href={url} target="_blank" rel="noopener noreferrer"
             className="underline decoration-dotted hover:opacity-80">{label}</a>
        );
      } else {
        out.push(m[0]);
      }
    }

    rest = rest.slice(m.index + m[0].length);
  }

  return out;
}

// ---- block parsing --------------------------------------------------------

const HEADING_SIZES = {
  1: 'text-sm font-bold',
  2: 'text-[13px] font-bold',
  3: 'text-xs font-semibold',
  4: 'text-xs font-semibold',
  5: 'text-xs font-semibold',
  6: 'text-xs font-semibold',
};

function renderBlocks(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  const isBullet = (l) => /^\s*[-*+]\s+/.test(l);
  const isOrdered = (l) => /^\s*\d+[.)]\s+/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    // Blank line → skip (spacing comes from block margins).
    if (!line.trim()) { i++; continue; }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      blocks.push(
        <p key={`h-${i}`} className={`${HEADING_SIZES[level]} text-inherit mt-2 first:mt-0`}>
          {parseInline(h[2].trim(), `h${i}`)}
        </p>
      );
      i++;
      continue;
    }

    // Blockquote (consume consecutive > lines)
    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote key={`q-${i}`} className="border-l-2 border-current/30 pl-2.5 my-1.5 opacity-80">
          {parseInline(quote.join(' '), `q${i}`)}
        </blockquote>
      );
      continue;
    }

    // Lists (ordered or unordered) — consume consecutive list lines.
    if (isBullet(line) || isOrdered(line)) {
      const ordered = isOrdered(line);
      const items = [];
      while (i < lines.length && (ordered ? isOrdered(lines[i]) : isBullet(lines[i]))) {
        const text = lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, '');
        items.push(
          <li key={`li-${i}-${items.length}`} className="leading-snug">
            {parseInline(text, `li${i}${items.length}`)}
          </li>
        );
        i++;
      }
      const listClass = ordered
        ? 'list-decimal pl-5 space-y-1 my-1.5 marker:text-current/60'
        : 'list-disc pl-5 space-y-1 my-1.5 marker:text-current/60';
      blocks.push(
        ordered
          ? <ol key={`ol-${i}`} className={listClass}>{items}</ol>
          : <ul key={`ul-${i}`} className={listClass}>{items}</ul>
      );
      continue;
    }

    // Paragraph — gather consecutive non-blank, non-block lines; single
    // newlines become <br> so intentional line breaks survive.
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !isBullet(lines[i]) &&
      !isOrdered(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`p-${i}`} className="leading-relaxed my-1.5 first:mt-0 last:mb-0">
        {para.flatMap((l, idx) => {
          const parsed = parseInline(l, `p${i}-${idx}`);
          return idx < para.length - 1 ? [...parsed, <br key={`br${i}-${idx}`} />] : parsed;
        })}
      </p>
    );
  }

  return blocks;
}

/**
 * Render a markdown string as styled React elements.
 * @param {{ children?: string, className?: string }} props
 */
export default function Markdown({ children, className = '' }) {
  if (children == null || children === '') return null;
  return <div className={`mc-markdown ${className}`}>{renderBlocks(children)}</div>;
}
