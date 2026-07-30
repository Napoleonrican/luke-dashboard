import { Rocket, Bot, SearchCheck, Sparkles, ExternalLink, Wrench } from 'lucide-react';
import { GIG_TRACKER_URL } from './constants';

function Card({ icon: Icon, title, accent, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className={accent} />
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      </div>
      <div className="text-xs text-zinc-400 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

export default function MissionTab() {
  return (
    <div className="space-y-4">
      <Card icon={Rocket} title="What Gig Tracker is" accent="text-cyan-400">
        <p>
          Gig Tracker is a mobile app for people who drive for DoorDash, Uber Eats, and similar
          apps. While they're on shift, it tells them — in real time — how much they're actually
          making per hour, so they can decide whether an order is worth accepting or better to
          skip.
        </p>
        <p>
          It's being built to eventually sell as a real product to other drivers, with free and
          paid tiers.
        </p>
        <a
          href={GIG_TRACKER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Open the live app <ExternalLink size={11} />
        </a>
        <p className="text-zinc-500">
          The <strong className="text-zinc-300">Open app</strong> button at the top right of this
          page gets you there any time.
        </p>
      </Card>

      <Card icon={Bot} title="Who's building it" accent="text-violet-400">
        <p>
          Nobody is hand-writing this code day to day — it's built by AI assistants working on a
          schedule, so the to-do list keeps moving even when nobody's watching it:
        </p>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong className="text-zinc-300">The Builder</strong> — checks the to-do list every morning and builds the next thing on it.</li>
          <li><strong className="text-zinc-300">The Reviewer</strong> — checks the app every couple of days for anything broken or worth improving.</li>
          <li><strong className="text-zinc-300">Test Drive</strong> — once a week, tries the app cold, like a real first-time driver would, and suggests ideas.</li>
        </ul>
        <p>
          Most of the time they don't need anyone — they just work through the list. This page
          exists for the times they genuinely can't decide something on their own.
        </p>
      </Card>

      <Card icon={SearchCheck} title="When you'll see something here" accent="text-amber-400">
        <p>
          Sometimes the assistants hit a question only a person can answer — not a coding
          question, but a real judgment call (e.g. "should this feature work this way or that
          way?"). When that happens, it shows up under the <strong className="text-zinc-300">Decisions &amp; Inbox</strong> tab.
        </p>
        <p>
          Answer it there in your own words. A coordinating assistant reads what you wrote,
          passes it along to the build team in their terms, and replies back to you in the
          same thread — so you never have to touch anything technical. You can also start
          your own thread there any time you have a question or something to raise.
        </p>
        <p className="text-zinc-500">
          That assistant checks in about <strong className="text-zinc-300">five times a day, roughly
          every 4 hours</strong>, with one longer stretch overnight — it isn't watching live, so a
          reply can take a little while to show up. That's normal, not a sign anything's stuck.
        </p>
        <p>
          The <strong className="text-zinc-300">Full Backlog</strong> tab shows the whole to-do
          list, and has a <strong className="text-zinc-300">Suggest an item</strong> button if you
          think of something the app should do.
        </p>
      </Card>

      <Card icon={Wrench} title="Seeing the paid features (hidden switch)" accent="text-amber-400">
        <p>
          The app will eventually have three levels — <strong className="text-zinc-300">Free</strong>,
          {' '}<strong className="text-zinc-300">Side Hustler</strong>, and
          {' '}<strong className="text-zinc-300">Full-Timer</strong> — and some features are locked
          unless you're on a paid one. There's a hidden switch so you can look at any of them
          without paying:
        </p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Open the app and tap the <strong className="text-zinc-300">gear icon</strong> (top right).</li>
          <li>Tap the word <strong className="text-zinc-300">"Settings"</strong> at the top of that panel <strong className="text-zinc-300">five times quickly</strong> — within about a second.</li>
          <li>A <strong className="text-zinc-300">🔧 Developer (Preview)</strong> section appears at the bottom.</li>
          <li>Under <strong className="text-zinc-300">Tier preview</strong>, pick the level you want to look at.</li>
        </ol>
        <p>
          It only affects the phone or browser you're using, and it isn't a real subscription —
          it's purely so you can see and judge the locked features. It stays on until you turn
          it off, so you don't have to redo the taps every time.
        </p>
      </Card>

      <Card icon={Sparkles} title="What you don't need to worry about" accent="text-emerald-400">
        <p>
          Anything you don't see flagged as needing a decision is already being handled — no news
          is genuinely good news here. You're not expected to check code, read GitHub, or know
          anything technical to use this page.
        </p>
      </Card>
    </div>
  );
}
