import { Rocket, Bot, SearchCheck, Sparkles, ExternalLink } from 'lucide-react';

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
          href="https://gig-tracker-lemon.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Open the live app <ExternalLink size={11} />
        </a>
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
          way?"). When that happens, it shows up under the <strong className="text-zinc-300">Backlog &amp; Decisions</strong> tab.
          Answering it there sends your answer straight back to them, and they pick it up on
          their next run.
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
