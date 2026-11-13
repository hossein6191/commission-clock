// Stages, as the contract divides the fee: the `stages` argument open_studio takes, built from the
// maker's form rows; each stage's share of a fee in atto (the last stage takes the odd atto); what
// accepting a stage pays at a given late cut; and the stage track a commission page draws. Pure, so
// tests/unit/stages.test.mjs runs every one of them from node against contracts/commission_clock.py.

import { cutOf, lateTerms, type ClockState } from "./clock.ts";
import { BPS, FIELD_SEP, KILL_BPS, MAX_STAGES, ONE_STAGE, STAGE_SEP, plain, pyStrip, stagesOf, type StagePart } from "./rules.ts";

/** One row of the maker's stage form: what the maker typed. The share is in basis points. */
export type StageDraft = { name: string; bps: number; about: string };

/** The `stages` argument from the form's rows: "" for one stage, else name=share or name=share=what it holds, joined by |. */
export function stagesArg(rows: StageDraft[]): string {
  if (rows.length === 0) return "";
  return rows
    .map((r) => {
      const name = pyStrip(plain(r.name));
      const about = pyStrip(plain(r.about));
      const share = String(Math.trunc(r.bps));
      return about ? [name, share, about].join(FIELD_SEP) : [name, share].join(FIELD_SEP);
    })
    .join(STAGE_SEP);
}

/** The contract's split of a fee over stages: stage k gets fee * bps // BPS, the last stage what is left. */
export function stageShares(feeAtto: bigint, bps: number[]): bigint[] {
  let given = 0n;
  return bps.map((b, i) => {
    const share = i === bps.length - 1 ? feeAtto - given : (feeAtto * BigInt(Math.trunc(b))) / BigInt(BPS);
    given += share;
    return share;
  });
}

export type StagePreview = {
  /** the argument open_studio is sent */
  arg: string;
  /** the contract's reading of it: its stages, or why it would be refused */
  stages: StagePart[];
  problem: string;
  /** each stage's share of the fee in atto, when the fee is known and the stages are good */
  shares: bigint[];
  /** the basis points the rows add up to, whatever the contract makes of them */
  total: number;
};

/** What the contract would make of the form: the argument, the stages or the refusal, and the shares of the fee. */
export function previewStages(rows: StageDraft[], feeAtto: bigint | null): StagePreview {
  const arg = stagesArg(rows);
  const { stages, problem } = stagesOf(pyStrip(arg));
  const total = rows.reduce((t, r) => t + (Number.isFinite(r.bps) ? Math.trunc(r.bps) : 0), 0);
  const shares = !problem && feeAtto !== null && feeAtto > 0n ? stageShares(feeAtto, stages.map((s) => s.bps)) : [];
  return { arg, stages, problem, shares, total };
}

/** accept_stage on a stage before the last: the maker gets its share less the late cut on that share alone. */
export function stageSplit(shareAtto: bigint, cutBps: number): { toMaker: bigint; toClient: bigint } {
  const cut = cutOf(shareAtto, cutBps);
  return { toMaker: shareAtto - cut, toClient: cut };
}

export type Splits = {
  /** accept_stage (accept_work on one stage): the current stage's share, or on the last stage all that is held */
  accept: { toMaker: bigint; toClient: bigint };
  /** claim_silence: the current stage as accepted when a delivery stands for it, plus the kill fee on the rest; else the kill fee on all that is held */
  silence: { toMaker: bigint; toClient: bigint };
  /** cancel_late: the current stage paid as accepted at the cut when a delivery stands for it, the rest back */
  cancel: { toMaker: bigint; toClient: bigint };
  /** the late cut reached at `now`, in basis points */
  total: number;
};

/**
 * What each settlement would pay at `now`, as the contract's _accept_current, claim_silence and
 * cancel_late work it out on what is still held. On one stage the share is the whole fee and this is
 * exactly the one-stage contract's split.
 */
export function settleSplits(c: ClockState, heldAtto: bigint, shareAtto: bigint, delivered: boolean, last: boolean, now: number): Splits {
  const { total } = lateTerms(c, now);
  const kill = Math.min(KILL_BPS, BPS - total);
  const base = last ? heldAtto : shareAtto;
  const accept = base - cutOf(base, total);
  const silence = delivered ? shareAtto - cutOf(shareAtto, total) + cutOf(heldAtto - shareAtto, kill) : cutOf(heldAtto, kill);
  const cancel = delivered ? shareAtto - cutOf(shareAtto, total) : 0n;
  return {
    accept: { toMaker: accept, toClient: base - accept },
    silence: { toMaker: silence, toClient: heldAtto - silence },
    cancel: { toMaker: cancel, toClient: heldAtto - cancel },
    total,
  };
}

/** Ready-made stage sets for the form, each adding up to BPS. */
export const STAGE_SETS: { label: string; rows: StageDraft[] }[] = [
  {
    label: "Outline, draft, final",
    rows: [
      { name: "Outline", bps: 2000, about: "a list of the points the piece will make" },
      { name: "First draft", bps: 3000, about: "the piece in full sentences, details may still be missing" },
      { name: "Final", bps: 5000, about: "the finished piece" },
    ],
  },
  {
    label: "Draft and final, half each",
    rows: [
      { name: "Draft", bps: 5000, about: "the whole piece, before the client's changes" },
      { name: "Final", bps: 5000, about: "the finished piece with the changes made" },
    ],
  },
  {
    label: "Four parts",
    rows: [
      { name: "Plan", bps: 1000, about: "what will be written and in what order" },
      { name: "First half", bps: 3000, about: "the first half of the piece, finished" },
      { name: "Second half", bps: 3000, about: "the second half of the piece, finished" },
      { name: "Polish", bps: 3000, about: "the whole piece, checked and finished" },
    ],
  },
];

export const MAX_STAGE_ROWS = MAX_STAGES;

/** A stage as a commission or a studio shows it. Amounts are decimal strings of atto. */
export type StageView = {
  k: number;
  name: string;
  about: string;
  shareBps: number;
  shareAtto: string;
  /** pending, current, accepted, the commission's final status, or closed */
  status: string;
  releasedAtto: string;
  cutAtto: string;
  cutBps: number;
  url: string;
  fp: string;
  /** the delivery that stands for it, 0 for none */
  deliveredBy: number;
  closedAt: number;
};

/** What one stage of the track says about itself, in a few words. */
export function stageWord(s: Pick<StageView, "status" | "deliveredBy">): string {
  if (s.status === "current") return s.deliveredBy > 0 ? "delivered, waiting for the client" : "in progress";
  if (s.status === "pending") return "not started";
  if (s.status === "accepted") return "accepted and paid";
  if (s.status === "closed") return "never reached";
  if (s.status === "accepted_by_silence") return "paid: the client went silent";
  if (s.status === "cancelled_late") return "settled: cancelled late";
  if (s.status === "lapsed") return "settled: lapsed";
  if (s.status === "withdrawn" || s.status === "declined") return s.status;
  return s.status;
}

/** True when a commission or studio is staged in the sense the contract judges: two stages or more. */
export const isStaged = (n: number): boolean => n >= 2;

/** The one stage of a studio that declared none. */
export const isDefaultStage = (s: { name: string; shareBps: number }): boolean => s.name === ONE_STAGE && s.shareBps === BPS;
