"use client";

// The two-faced tournament clock in walnut: MAKER on the left, CLIENT on the right. The face whose
// move it is glows amber and its plunger stands up, the other is dimmed with its plunger pressed down,
// and a small red flag drops on a face once its side is over its allowance. Each face shows the
// seconds its side has left (negative once over) as the contract counts them: its used seconds, plus
// the running turn less its grace while it holds the move. LiveClock ticks a commission's faces on
// the browser's clock, kept in step with the view's own clock.

import * as React from "react";

import { useNow } from "@/components/use-now";
import { faceText, graceLeft, live, type ClockState } from "@/lib/clock";
import { span } from "@/lib/format";
import { cx } from "@/lib/cx";
import type { Holder, Side } from "@/lib/rules";
import type { Commission } from "@/lib/types";

export type FaceState = {
  /** seconds left of the allowance; negative once over */
  left: number;
  used: number;
  allowance: number;
};

type Size = "lg" | "md" | "sm";

// Sized by the clock's own width (it is a size container), so a narrow column never clips the digits.
const DIGITS: Record<Size, string> = {
  lg: "text-[clamp(24px,10.5cqi,60px)]",
  md: "text-[clamp(20px,9.5cqi,40px)]",
  sm: "text-[clamp(14px,8.5cqi,22px)]",
};

function Flag({ fallen }: { fallen: boolean }) {
  return (
    <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true" className="shrink-0 overflow-visible">
      <path d="M3 2V24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <g className="flag" data-fallen={fallen ? "true" : "false"} style={{ transformOrigin: "3px 3px" }}>
        <path d="M3 3 L15 7 L3 11 Z" fill="#D7263D" />
      </g>
    </svg>
  );
}

function Face({ side, state, lit, size, note }: { side: Side; state: FaceState; lit: boolean; size: Size; note?: string }) {
  const over = state.left < 0;
  return (
    <div className={cx("clock-face flex min-w-0 flex-col", size === "sm" ? "px-2 py-1.5" : "px-3 py-2.5 sm:px-4 sm:py-3")} data-lit={lit ? "true" : "false"} data-over={over ? "true" : "false"}>
      <div className="flex items-start justify-between gap-1">
        <span className={cx("font-bold tracking-[0.14em]", size === "sm" ? "text-[9.5px]" : "text-[11px]")}>{side === "maker" ? "MAKER" : "CLIENT"}</span>
        {size !== "sm" && <Flag fallen={over} />}
      </div>
      <span className={cx("clock-digits mt-0.5 block overflow-hidden whitespace-nowrap", DIGITS[size], over && "text-flag-ink")}>{faceText(state.left)}</span>
      {size !== "sm" && (
        <span className="mt-1 truncate text-[11.5px] font-semibold opacity-80">
          {note ?? `used ${span(state.used)} of ${span(state.allowance)}`}
        </span>
      )}
    </div>
  );
}

/** The clock, drawn: which face is lit, what each shows, and the plate under it. */
export function ChessClock({
  holder,
  maker,
  client,
  size = "lg",
  plate,
  makerNote,
  clientNote,
  className,
}: {
  holder: Holder;
  maker: FaceState;
  client: FaceState;
  size?: Size;
  /** the brass plate under the faces: the clock's state in a few words */
  plate?: React.ReactNode;
  makerNote?: string;
  clientNote?: string;
  className?: string;
}) {
  const label =
    `Chess clock. Maker: ${faceText(maker.left)} left${holder === "maker" ? ", holds the move" : ""}${maker.left < 0 ? ", over its allowance" : ""}. ` +
    `Client: ${faceText(client.left)} left${holder === "client" ? ", holds the move" : ""}${client.left < 0 ? ", over its allowance" : ""}.`;
  return (
    <div role="img" aria-label={label} className={cx("clock-case", size === "sm" ? "px-2 pt-3 pb-2" : "px-3 pt-6 pb-3 sm:px-5 sm:pt-7 sm:pb-4", className)}>
      {size !== "sm" && (
        <>
          <span className="clock-plunger left-[10%]" data-down={holder === "maker" ? "false" : "true"} aria-hidden="true" />
          <span className="clock-plunger right-[10%]" data-down={holder === "client" ? "false" : "true"} aria-hidden="true" />
        </>
      )}
      <div className={cx("relative z-[1] grid grid-cols-2", size === "sm" ? "gap-1.5" : "gap-2.5 sm:gap-4")}>
        <Face side="maker" state={maker} lit={holder === "maker"} size={size} note={makerNote} />
        <Face side="client" state={client} lit={holder === "client"} size={size} note={clientNote} />
      </div>
      {plate && size !== "sm" && (
        <div className="relative z-[1] mt-2.5 flex justify-center">
          <span className="brass brass-sm pointer-events-none max-w-full !cursor-default !whitespace-normal text-center">{plate}</span>
        </div>
      )}
    </div>
  );
}

/** A commission's clock state from its row. */
export const clockOf = (c: Commission): ClockState => ({
  holder: c.holder,
  since: c.since,
  handedBy: c.handedBy,
  makerUsed: c.makerUsed,
  clientUsed: c.clientUsed,
  makerSeconds: c.makerSeconds,
  clientSeconds: c.clientSeconds,
  stepSeconds: c.stepSeconds,
  cutBps: c.cutBps,
  maxCutBps: c.maxCutBps,
});

/** The clock the page counts with: the browser's, moved by the skew between the view's clock and the browser's when it was read. */
export function useCommissionNow(c: Commission | null): number {
  const now = useNow();
  if (!now) return 0;
  if (!c || c.now <= 0 || !c.readAt) return now;
  return now + (c.now - c.readAt);
}

/** A commission's faces, ticking: the faces as the contract would count them at this second. */
export function LiveClock({ c, size = "lg", className }: { c: Commission; size?: Size; className?: string }) {
  const now = useCommissionNow(c);
  const clock = clockOf(c);
  const settled = c.status !== "active";
  const t = now || c.now;
  const makerUsed = settled ? c.makerUsed : live(clock, "maker", t);
  const clientUsed = settled ? c.clientUsed : live(clock, "client", t);
  const grace = settled ? 0 : graceLeft(clock, t);
  const plate =
    c.status === "requested"
      ? "Not started: waiting for the maker to accept"
      : c.status === "active"
        ? grace > 0
          ? `The ${c.holder}'s turn: ${span(grace)} of grace left`
          : `The clock runs against the ${c.holder}`
        : "Stopped: settled";
  const note = (side: Side) => (!settled && grace > 0 && c.holder === side ? `grace ${span(grace)}, then charged` : undefined);
  return (
    <ChessClock
      className={className}
      size={size}
      holder={settled ? "" : c.holder}
      maker={{ left: c.makerSeconds - makerUsed, used: makerUsed, allowance: c.makerSeconds }}
      client={{ left: c.clientSeconds - clientUsed, used: clientUsed, allowance: c.clientSeconds }}
      makerNote={note("maker")}
      clientNote={note("client")}
      plate={plate}
    />
  );
}
