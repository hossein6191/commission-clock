"use client";

// The waiting panel: a ruled tournament score sheet laid on the table. What is happening right now
// and who it waits for, then five short lines (how long, what is needed from you, who the clock runs
// against, whether you can leave, where the fee is), a small digital counter, and the next button
// when there is one. The words come from lib/guide.ts, the same for every in-between state of the
// site. A page shows one at a time, where its action happens; the panel scrolls itself into view when
// a busy state first appears (a calm state never moves the page). Five tones: busy (a transaction or
// the demo maker is at work: the second hand ticks), clock (a side holds the move: a countdown), late
// (over an allowance, or slower than it should be), ready (something can be done now) and done
// (settled: where the fee ended up).

import * as React from "react";

import { IconCheck, IconExternal, IconFlag } from "@/components/icons";
import { useWallNow } from "@/components/use-now";
import { cx } from "@/lib/cx";
import type { Guide } from "@/lib/guide";

export type WaitTone = "busy" | "clock" | "late" | "ready" | "done";

/** The five lines under the title, from a guide. */
export type WaitLines = { time: string; need: string; clock: string; leave: string; canLeave: boolean; money: string };

export type Wait = {
  /** a stable name for the state, e.g. "judging"; written on the panel for tests and tools */
  id: string;
  tone: WaitTone;
  kicker?: string;
  title: string;
  body?: React.ReactNode;
  lines?: WaitLines;
  /** browser-clock seconds when the wait began: an elapsed counter runs from it */
  since?: number;
  /** seconds left on the contract's clock: a countdown in place of the elapsed counter */
  left?: number;
  leftLabel?: string;
  link?: { href: string; label: string };
  action?: React.ReactNode;
  /** anything shown between the title and the lines: the validators at work */
  scene?: React.ReactNode;
};

const KICKER: Record<WaitTone, string> = {
  busy: "In progress",
  clock: "On the clock",
  late: "Over time",
  ready: "Ready",
  done: "Settled",
};

/** A guide from lib/guide.ts as a panel, with what only the page has: the button, the link, the counter's start. */
export function waitOf(g: Guide, extra: Pick<Wait, "action" | "link" | "since" | "scene"> = {}): Wait {
  return {
    id: g.id,
    tone: g.tone,
    kicker: g.kicker,
    title: g.now,
    body: g.note || undefined,
    lines: { time: g.time, need: g.need, clock: g.clock, leave: g.leave, canLeave: g.canLeave, money: g.money },
    left: g.left !== undefined && g.left > 0 ? g.left : undefined,
    leftLabel: g.leftLabel,
    ...extra,
  };
}

/** "0:42", "12:05", "1:02:09"; longer than a day, "2 d 3 h". */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  if (d > 0) {
    const h = Math.floor((s % 86400) / 3600);
    return h ? `${d} d ${h} h` : `${d} d`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const EDGE: Record<WaitTone, string> = {
  busy: "border-l-amber",
  clock: "border-l-walnut",
  late: "border-l-flag",
  ready: "border-l-felt",
  done: "border-l-line-strong",
};

/** A small dial whose second hand ticks while something is at work. */
function Dial({ moving }: { moving: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <g className={moving ? "second-hand" : undefined}>
        <path d="M10 10V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </g>
      <circle cx="10" cy="10" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function WaitPanel({ wait, className }: { wait: Wait; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const wall = useWallNow();

  const moving = wait.tone === "busy" || wait.tone === "late";
  React.useEffect(() => {
    const el = ref.current;
    if (wait.tone !== "busy" || !el || typeof el.scrollIntoView !== "function") return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [wait.id, wait.tone]);

  const tone = wait.tone;
  const counter =
    wait.left !== undefined
      ? { text: clockText(wait.left), label: wait.leftLabel ?? "left" }
      : wait.since && wall
        ? { text: clockText(wall - wait.since), label: "elapsed" }
        : null;
  const lines = wait.lines;

  return (
    <div
      ref={ref}
      data-wait={wait.id}
      className={cx("sheet scoresheet scroll-mt-4 scroll-mb-4 overflow-hidden border-l-[6px]", EDGE[tone], className)}
    >
      <div className="px-4 pt-3.5 pb-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0" role="status" aria-live="polite" aria-atomic="true">
            <p className={cx("kicker flex items-center gap-1.5", tone === "late" ? "text-flag-ink" : tone === "ready" ? "text-felt-ink" : tone === "busy" ? "text-amber-ink" : "text-ink-3")}>
              {tone === "done" || tone === "ready" ? <IconCheck size={14} /> : tone === "late" ? <IconFlag size={14} /> : <Dial moving={moving} />}
              {wait.kicker ?? KICKER[tone]}
            </p>
            <p className="display mt-1 text-[19px] leading-snug font-bold text-ink">{wait.title}</p>
          </div>
          {counter && (
            <div className="shrink-0 rounded-lg bg-walnut-deep px-2.5 py-1.5 text-right shadow-inner">
              <p className="mono text-[24px] leading-none text-amber-glow">{counter.text}</p>
              <p className="mt-0.5 text-[10px] font-bold tracking-[0.1em] text-white/70 uppercase">{counter.label}</p>
            </div>
          )}
        </div>
        {wait.scene && <div className="mt-3">{wait.scene}</div>}
        {wait.body && <div className="mt-2 text-[14px] leading-relaxed text-ink-2">{wait.body}</div>}
        {lines && (
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-[14px] leading-[1.45]">
            <Line label="How long">{lines.time}</Line>
            <Line label="From you" strong>
              {lines.need}
            </Line>
            <Line label="Clock">{lines.clock}</Line>
            <Line label="Leave?" warn={!lines.canLeave}>
              {lines.leave}
            </Line>
            <Line label="Fee">{lines.money}</Line>
          </dl>
        )}
        {(wait.action || wait.link) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {wait.action}
            {wait.link && (
              <a href={wait.link.href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-[13px] text-ink-2">
                {wait.link.label}
                <IconExternal size={12} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ label, children, strong, warn }: { label: string; children: React.ReactNode; strong?: boolean; warn?: boolean }) {
  return (
    <>
      <dt className="border-t border-line pt-1.5 pb-1 text-[11.5px] font-bold tracking-[0.08em] whitespace-nowrap text-ink-3 uppercase">{label}</dt>
      <dd className={cx("min-w-0 border-t border-line pt-1.5 pb-1", strong ? "font-semibold text-ink" : warn ? "font-semibold text-flag-ink" : "text-ink-2")}>{children}</dd>
    </>
  );
}
