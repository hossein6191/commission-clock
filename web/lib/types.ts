// The shapes the pages use, in one place with no runtime code: lib/chain.ts maps every view answer
// into these, and lib/chain-mock.ts answers in the contract's own JSON so the same mappers run in
// both modes. Every instant is seconds on the message clock; 0 until it happens. Every amount is a
// decimal string of atto.

import type { CommissionStatus, Holder, MessageKind, MessageVerdict, Side } from "./rules.ts";

/** The record a studio carries on the contract: counts of what happened to its commissions. */
export type StudioRecord = {
  commissions: number;
  onTime: number;
  late: number;
  cancelledLate: number;
  lapsed: number;
  declined: number;
  withdrawn: number;
  presses: number;
  passed: number;
  kept: number;
  unclear: number;
  deliveries: number;
  delivered: number;
  missing: number;
  lateSeconds: number;
};

/** studio(id): a maker's terms, fixed for good, and its public record. */
export type Studio = {
  /** "S1" */
  id: string;
  maker: string;
  name: string;
  about: string;
  feeAtto: string;
  makerSeconds: number;
  clientSeconds: number;
  stepSeconds: number;
  cutBps: number;
  maxCutBps: number;
  killBps: number;
  accepting: boolean;
  openedAt: number;
  record: StudioRecord;
};

/** commission(id): one commission, its terms (copied from the studio), its clock and its settlement. */
export type Commission = {
  /** "C3" */
  id: string;
  studio: string;
  studioName: string;
  maker: string;
  client: string;
  brief: string;
  feeAtto: string;
  status: CommissionStatus;
  holder: Holder;
  since: number;
  handedBy: number;
  grace: number;
  makerUsed: number;
  clientUsed: number;
  makerSeconds: number;
  clientSeconds: number;
  stepSeconds: number;
  cutBps: number;
  maxCutBps: number;
  capAfter: number;
  killBps: number;
  requestedAt: number;
  acceptedAt: number;
  settledAt: number;
  messages: number;
  deliveries: number;
  lastUrl: string;
  lastFp: string;
  lastDeliveredAt: number;
  makerLate: number;
  cutBpsTotal: number;
  makerPaidAtto: string;
  clientPaidAtto: string;
  heldAtto: string;
  /** the view's own clock when it was read; 0 when the read had none */
  now: number;
  /** the browser's clock (the mock's, in mock mode) when the row was read: with `now`, the skew a live face ticks with */
  readAt: number;
  /** the live uses the view worked out at `now`; -1 when it had no clock */
  makerLive: number;
  clientLive: number;
  /** in commissions_of rows: the address's side */
  role?: Side;
};

/** One message of a thread: something said, a delivery, or a side taking the move. */
export type Message = {
  /** "C3#4" */
  id: string;
  n: number;
  role: Side;
  kind: MessageKind;
  text: string;
  url: string;
  verdict: MessageVerdict;
  fp: string;
  at: number;
};

export type Paged<T> = { total: number; offset: number; limit: number; rows: T[] };

/** stats(): totals only. Amounts in atto. */
export type Stats = {
  studios: number;
  commissions: number;
  waiting: number;
  active: number;
  accepted: number;
  acceptedBySilence: number;
  lapsed: number;
  cancelledLate: number;
  withdrawn: number;
  declined: number;
  presses: number;
  passed: number;
  kept: number;
  unclear: number;
  noted: number;
  takes: number;
  deliveries: number;
  delivered: number;
  missing: number;
  deliveryUnclear: number;
  heldAtto: string;
  takenAtto: string;
  toMakersAtto: string;
  toClientsAtto: string;
  refusedPayments: number;
  returnedAtto: string;
};

/** rules(): the contract's own words, kept as it wrote them. */
export type Rules = Record<string, unknown>;

export type Votes = { agree: number; disagree: number; idle: number };

export type TxStatus = {
  /** PENDING | PROPOSING | COMMITTING | REVEALING | ACCEPTED | FINALIZED | CANCELED | UNDETERMINED | UNKNOWN */
  status: string;
  votes: Votes;
  /** null until votes exist */
  applied: boolean | null;
  /** finished with no majority: nothing was stored */
  undetermined: boolean;
  /** SUCCESS | ERROR | null */
  exec: string | null;
  /** the contract's JSON return, if any */
  result: Record<string, unknown> | null;
  /** the decoded return or error text */
  message: string;
};

export type ReadResult<T> = { data: T; source: "chain" | "mock" };

/** The contract's write methods, by name. */
export type WriteFn =
  | "open_studio"
  | "close_studio"
  | "reopen_studio"
  | "request_commission"
  | "withdraw_request"
  | "decline"
  | "accept"
  | "say"
  | "deliver"
  | "take_move"
  | "accept_work"
  | "claim_silence"
  | "cancel_late";

export type Arg = string | number;

/** One contract call, ready to sign: the method, its arguments in the contract's order, and the value sent. */
export type Call = { fn: WriteFn; args: Arg[]; value?: bigint };

/**
 * Whether the demo maker can act now, whose it is, which studio it runs, and exactly why not. `drafts`
 * says whether it can deliver: the drafts are pinned to a commit of a known repository.
 */
export type DemoStatus = { online: boolean; maker: string; studio: string; reason: string; drafts: boolean; draftsReason: string };

/** What the demo maker answered when asked to act: a transaction hash, or why not. */
export type DemoAnswer = { ok: true; hash: string } | { ok: false; reason: string; retryAfter?: number };
