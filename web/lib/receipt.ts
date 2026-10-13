// What a judged message is stamped with, and the lines of a settlement receipt. Pure, no React: the
// thread (components/press-card.tsx) and the receipt (components/settlement.tsx) print these, and
// tests/unit/receipt.test.mjs checks every verdict and every way a commission settles.

import { cutOf } from "./clock.ts";
import { fpShort, gen, pct, span } from "./format.ts";
import { KILL_BPS, type CommissionStatus, type MessageKind, type MessageVerdict, type Side } from "./rules.ts";

export type StampTone = "counted" | "kept" | "unclear" | "noted" | "delivered" | "missing" | "taken";

export type Stamp = { text: string; tone: StampTone; meaning: string };

/** The stamp on one message of the thread, worded for whoever is reading it. */
export function stampOf(m: { kind: MessageKind; verdict: MessageVerdict; role: Side; fp: string }, viewer: Side | "visitor"): Stamp {
  const mine = viewer === m.role;
  const to: Side = m.role === "maker" ? "client" : "maker";
  const still = mine ? "still your move" : `still the ${m.role}'s move`;
  if (m.kind === "take") return { text: "TOOK THE MOVE", tone: "taken", meaning: `The ${m.role} took the move onto itself; its own clock runs from this message.` };
  if (m.kind === "deliver") {
    if (m.verdict === "delivered")
      return {
        text: `DRAFT READ ON THE WEB - delivered (fp ${fpShort(m.fp)})`,
        tone: "delivered",
        meaning: "Every validator opened the page on the live web and agreed the finished piece is there; the move went to the client if the maker held it.",
      };
    if (m.verdict === "missing")
      return { text: "DRAFT MISSING", tone: "missing", meaning: "The validators agreed the page does not hold the finished piece: a placeholder, an outline, a part, or something else. Nothing moved." };
    return { text: "DRAFT UNCLEAR - not counted", tone: "unclear", meaning: "The validators' answers did not agree on the page. Nothing moved; the maker may deliver again." };
  }
  if (m.verdict === "noted")
    return { text: "NOTED - not a press", tone: "noted", meaning: `Sent while the ${to} held the move: recorded, nobody asked, and the ${to}'s clock kept running.` };
  if (m.verdict === "pass")
    return { text: `PRESS COUNTED - move to ${to}`, tone: "counted", meaning: `The network agreed the ${m.role} is now waiting on the ${to}: the move went over, with five minutes' grace.` };
  if (m.verdict === "keep")
    return { text: `PRESS NOT COUNTED - ${still}`, tone: "kept", meaning: `The network agreed the ${m.role} can still carry on without the ${to}: the move, and the clock, stayed.` };
  return { text: `UNCLEAR - ${still}`, tone: "unclear", meaning: "The four askings did not all agree, so the move stayed. The sender may rephrase." };
}

export type ReceiptLine = { label: string; value: string; strong?: boolean };

export type ReceiptInput = {
  status: CommissionStatus;
  feeAtto: string;
  makerUsed: number;
  clientUsed: number;
  makerSeconds: number;
  clientSeconds: number;
  makerLate: number;
  cutBpsTotal: number;
  maxCutBps: number;
  deliveries: number;
  makerPaidAtto: string;
  clientPaidAtto: string;
};

export const ENDINGS: Record<Exclude<CommissionStatus, "requested" | "active">, string> = {
  accepted: "Accepted by the client",
  accepted_by_silence: "Settled by the client's silence, as accepted",
  lapsed: "Lapsed: the client went silent before any delivery",
  cancelled_late: "Cancelled late by the client, the cut at its cap",
  withdrawn: "Withdrawn by the client before acceptance",
  declined: "Declined by the maker",
};

/** The receipt of a settled commission: the fee, the clock as it stopped, the cut, and where every atto went. */
export function settlementLines(r: ReceiptInput): ReceiptLine[] {
  const fee = BigInt(r.feeAtto || "0");
  const lines: ReceiptLine[] = [{ label: "Fee held", value: gen(fee) }];
  if (r.status === "withdrawn" || r.status === "declined") {
    lines.push({ label: "Clock", value: "never started" });
  } else {
    lines.push({ label: "Maker's clock", value: `${span(r.makerUsed)} of ${span(r.makerSeconds)}` });
    lines.push({ label: "Client's clock", value: `${span(r.clientUsed)} of ${span(r.clientSeconds)}` });
    lines.push({ label: "Maker over", value: r.makerLate > 0 ? span(r.makerLate) : "no" });
    lines.push({ label: "Late cut", value: `${pct(r.cutBpsTotal)} = ${gen(cutOf(fee, r.cutBpsTotal))}` });
    if (r.status === "lapsed") lines.push({ label: "Kill fee", value: `${pct(Math.min(KILL_BPS, 10000 - r.cutBpsTotal))} of the fee` });
    if (r.status === "cancelled_late") lines.push({ label: "Delivery recorded", value: r.deliveries > 0 ? "yes: settled as accepted at the cap" : "no: the whole fee back" });
  }
  lines.push({ label: "To the maker", value: gen(r.makerPaidAtto), strong: true });
  lines.push({ label: "To the client", value: gen(r.clientPaidAtto), strong: true });
  return lines;
}
