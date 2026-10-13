// The chess clock, as the contract keeps it: who holds the move since when, each side's used seconds,
// the grace on a turn handed over by a judged message or a delivery, the late cut, and when each
// settlement against the holder opens. The live faces on every page tick with these, the in-memory
// contract of mock mode moves its clock with them, and tests/unit/clock.test.mjs checks every one
// against contracts/commission_clock.py itself. Pure, no imports beyond the limits.

import { BPS, KILL_BPS, TURN_GRACE, TURN_NOTICE, stepsToCap, type Holder, type Side } from "./rules.ts";

/** What the clock needs to know of a commission: its row in seconds and atto. */
export type ClockState = {
  holder: Holder;
  /** when the holder took the move; never moves back */
  since: number;
  /** the message that handed the holder the move; 0 when it took the move itself or the maker accepted */
  handedBy: number;
  makerUsed: number;
  clientUsed: number;
  makerSeconds: number;
  clientSeconds: number;
  stepSeconds: number;
  cutBps: number;
  maxCutBps: number;
};

/** The contract's _grace: TURN_GRACE when a judged message or a delivery handed the move over. */
export const grace = (c: Pick<ClockState, "handedBy">): number => (c.handedBy > 0 ? TURN_GRACE : 0);

/** The contract's _charged: the running turn's charged seconds, never negative. */
export const charged = (c: ClockState, now: number): number => Math.max(0, now - c.since - grace(c));

/** The contract's _live: a side's used seconds, plus the running turn's charged seconds while it holds the move. */
export function live(c: ClockState, side: Side, now: number): number {
  let used = side === "maker" ? c.makerUsed : c.clientUsed;
  if (c.holder === side) used += charged(c, now);
  return used;
}

/** Seconds of grace the running turn still has: the holder is not being charged until they pass. */
export const graceLeft = (c: ClockState, now: number): number => (c.holder ? Math.max(0, c.since + grace(c) - now) : 0);

/** The contract's _cut_bps_for: cut_bps for every STARTED step late, never above the cap. */
export function cutBpsFor(late: number, step: number, cutBps: number, maxCutBps: number): number {
  const steps = late > 0 ? Math.floor((late + step - 1) / step) : 0;
  return Math.min(maxCutBps, steps * cutBps);
}

/** The contract's _cut_of: the cut in atto, rounded down; the maker keeps the odd atto. */
export const cutOf = (fee: bigint, totalBps: number): bigint => (fee * BigInt(totalBps)) / BigInt(BPS);

/** The contract's _late_terms: the maker's seconds over its allowance, and the cut in basis points they come to. */
export function lateTerms(c: ClockState, now: number): { late: number; total: number } {
  const late = Math.max(0, live(c, "maker", now) - c.makerSeconds);
  return { late, total: cutBpsFor(late, c.stepSeconds, c.cutBps, c.maxCutBps) };
}

/** The contract's _cap_after: the maker's use past which its cut is at the cap. */
export const capAfter = (c: Pick<ClockState, "makerSeconds" | "cutBps" | "maxCutBps" | "stepSeconds">): number =>
  c.makerSeconds + (stepsToCap(c.cutBps, c.maxCutBps) - 1) * c.stepSeconds;

/** The contract's _opens_in: seconds until the running turn has been charged `need` seconds, if it does not move. */
export const opensIn = (c: ClockState, now: number, need: number): number => Math.max(0, c.since + grace(c) - now) + Math.max(0, need - charged(c, now));

/** claim_silence's wait: once the client is past its allowance and its turn has been charged TURN_NOTICE. Only while the client holds the move. */
export const silenceOpensIn = (c: ClockState, now: number): number => opensIn(c, now, Math.max(TURN_NOTICE, c.clientSeconds + 1 - c.clientUsed));

/** cancel_late's wait: once the maker's cut is at the cap and its turn has been charged TURN_NOTICE. Only while the maker holds the move. */
export const cancelOpensIn = (c: ClockState, now: number): number => opensIn(c, now, Math.max(TURN_NOTICE, capAfter(c) + 1 - c.makerUsed));

/** The contract's _move_to: the holder's running turn is added to its used seconds; since never moves back. */
export function moveTo(c: ClockState, side: Holder, now: number, by: number): void {
  if (c.holder === side) return;
  const elapsed = charged(c, now);
  if (c.holder === "maker") c.makerUsed += elapsed;
  else if (c.holder === "client") c.clientUsed += elapsed;
  c.holder = side;
  c.since = Math.max(now, c.since);
  c.handedBy = by;
}

export type Split = { toMaker: bigint; toClient: bigint; late: number; total: number };

const split = (fee: bigint, toMaker: bigint, late: number, total: number): Split => {
  const m = toMaker < 0n ? 0n : toMaker > fee ? fee : toMaker;
  return { toMaker: m, toClient: fee - m, late, total };
};

/** accept_work at `now`: the maker gets the fee less the late cut, the client the cut. */
export function acceptSplit(c: ClockState, fee: bigint, now: number): Split {
  const { late, total } = lateTerms(c, now);
  return split(fee, fee - cutOf(fee, total), late, total);
}

/** claim_silence at `now`: as accept_work with a delivery recorded; else the kill fee, never more than the fee less the cut. */
export function silenceSplit(c: ClockState, fee: bigint, deliveries: number, now: number): Split {
  const { late, total } = lateTerms(c, now);
  if (deliveries > 0) return split(fee, fee - cutOf(fee, total), late, total);
  return split(fee, cutOf(fee, Math.min(KILL_BPS, BPS - total)), late, total);
}

/** cancel_late at `now`: the whole fee back without a delivery; with one, as accept_work at the cap. */
export function cancelSplit(c: ClockState, fee: bigint, deliveries: number, now: number): Split {
  const { late, total } = lateTerms(c, now);
  return split(fee, deliveries > 0 ? fee - cutOf(fee, total) : 0n, late, total);
}

/** The clock a view answered with, made to tick on the browser's clock: the skew between the two, kept. */
export const skewOf = (viewNow: number, browserNow: number): number => (viewNow > 0 && browserNow > 0 ? viewNow - browserNow : 0);

/** "12:04", "1:02:09", "-0:42", "3d 4h" for a face: the seconds a side has left (negative once over), as a clock prints them. */
export function faceText(secondsLeft: number): string {
  const neg = secondsLeft < 0;
  const s = Math.abs(Math.trunc(secondsLeft));
  if (s >= 2 * 86400) return (neg ? "-" : "") + `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  return (neg ? "-" : "") + body;
}
