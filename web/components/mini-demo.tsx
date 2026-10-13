"use client";

// The promise in one minute: a scripted commission on the demo studio's terms, played on the real
// clock arithmetic (lib/clock.ts) at 25 times speed. The maker accepts, asks a real question (the
// move goes over), gets an answer, asks a sham question and sends a promise (the move stays), then
// delivers; the client accepts inside the allowance. For anyone who asks for reduced motion it does
// not play by itself: a button steps through the moves.

import * as React from "react";

import { Brass } from "@/components/button";
import { ChessClock } from "@/components/chess-clock";
import { live, moveTo, type ClockState } from "@/lib/clock";
import { DEMO_TERMS } from "@/lib/demo-studio";
import { span } from "@/lib/format";
import { stampOf } from "@/lib/receipt";
import type { MessageKind, MessageVerdict, Side } from "@/lib/rules";
import { cx } from "@/lib/cx";

type Beat = { t: number; side: Side; kind: MessageKind | "accept" | "settle"; text: string; verdict?: MessageVerdict };

/** The story, in game seconds. */
export const STORY: Beat[] = [
  { t: 0, side: "maker", kind: "accept", text: "The maker accepts: the clock starts on the maker." },
  { t: 240, side: "maker", kind: "say", text: "Which glaze should the description name? The brief does not say.", verdict: "pass" },
  { t: 600, side: "client", kind: "say", text: "Sea-green, please.", verdict: "pass" },
  { t: 840, side: "maker", kind: "say", text: "Should the description be written in English?", verdict: "keep" },
  { t: 1080, side: "maker", kind: "say", text: "Working on it, nearly there.", verdict: "keep" },
  { t: 1320, side: "maker", kind: "deliver", text: "mug-final.html", verdict: "delivered" },
  { t: 1500, side: "client", kind: "settle", text: "The client accepts the work: the maker was inside its 20 minutes, so it gets the whole fee." },
];
const END = 1500;
const SPEED = 25;
const PAUSE = 5;

/** The clock as the contract would hold it at game second `t` of the story. */
export function storyAt(t: number): { clock: ClockState; beats: Beat[] } {
  const clock: ClockState = { holder: "", since: 0, handedBy: 0, makerUsed: 0, clientUsed: 0, ...DEMO_TERMS };
  const beats: Beat[] = [];
  STORY.forEach((b, i) => {
    if (b.t > t) return;
    beats.push(b);
    if (b.kind === "accept") moveTo(clock, "maker", b.t, 0);
    else if (b.kind === "settle") moveTo(clock, "", b.t, 0);
    else if (b.verdict === "pass") moveTo(clock, b.side === "maker" ? "client" : "maker", b.t, i);
    else if (b.verdict === "delivered" && clock.holder === "maker") moveTo(clock, "client", b.t, i);
  });
  return { clock, beats };
}

const subscribeMotion = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function MiniDemo() {
  const reduce = React.useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const [t, setT] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const playing = !reduce && !paused;

  React.useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setT((x) => (x >= END + PAUSE * SPEED ? 0 : x + SPEED / 4)), 250);
    return () => clearInterval(timer);
  }, [playing]);

  const shown = Math.min(t, END);
  const { clock, beats } = storyAt(shown);
  const makerUsed = live(clock, "maker", shown);
  const clientUsed = live(clock, "client", shown);
  const recent = beats.slice(-3).reverse();
  const next = STORY.find((b) => b.t > shown);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ChessClock
        holder={clock.holder}
        maker={{ left: DEMO_TERMS.makerSeconds - makerUsed, used: makerUsed, allowance: DEMO_TERMS.makerSeconds }}
        client={{ left: DEMO_TERMS.clientSeconds - clientUsed, used: clientUsed, allowance: DEMO_TERMS.clientSeconds }}
        plate={shown >= END ? "Settled: the whole fee to the maker" : clock.holder ? `Game minute ${Math.floor(shown / 60)}: the clock runs against the ${clock.holder}` : "Waiting for the maker to accept"}
      />
      <ol className="flex min-h-[176px] flex-col gap-1.5" aria-live="off">
        {recent.map((b, i) => {
          const stamp = b.verdict ? stampOf({ kind: b.kind as MessageKind, verdict: b.verdict, role: b.side, fp: "b9d43c8d6508c6f2" }, "visitor") : null;
          return (
            <li key={b.t} className={cx("rounded-lg border border-line bg-card px-3 py-2 text-[13.5px]", i > 0 && "opacity-60")}>
              <span className="mr-1.5 text-[11px] font-bold tracking-[0.12em] text-ink-3 uppercase">{b.kind === "accept" || b.kind === "settle" ? "clock" : b.side}</span>
              <span className="text-ink">{b.kind === "deliver" ? `delivers ${b.text}` : b.text}</span>
              {stamp && (
                <span className={cx("stamp ml-2 align-middle text-[10.5px]", stamp.tone === "counted" || stamp.tone === "delivered" ? "text-felt" : "text-walnut")}>{stamp.text}</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {reduce ? (
          <Brass size="sm" onClick={() => setT(next ? next.t : 0)}>
            {next ? "Next move" : "Start again"}
          </Brass>
        ) : (
          <Brass size="sm" variant="plain" onClick={() => setPaused((p) => !p)}>
            {paused ? "Play" : "Pause"}
          </Brass>
        )}
        <Brass size="sm" variant="plain" onClick={() => setT(0)}>
          From the start
        </Brass>
        <span className="text-[12.5px] text-ink-3">25× speed · the demo studio&apos;s terms · {span(DEMO_TERMS.makerSeconds)} for the maker, {span(DEMO_TERMS.clientSeconds)} for the client</span>
      </div>
    </div>
  );
}
