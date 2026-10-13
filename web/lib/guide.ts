// What a visitor is told whenever they wait, in plain lines: what is happening now and who it waits
// for, how long that takes or the exact time, what is needed from them, who the clock runs against
// right now, whether they can close the page, and where the fee is. The same words for every
// in-between state of the site: a wallet prompt, a transaction on its way, the validators judging a
// press or reading a draft page, a request waiting to be accepted, each side holding the move (inside
// its grace, charging, over its allowance, with a settlement open against it), the demo maker at
// work, and every way a commission settles.
//
// Pure, with no React: the state, the viewer's role and the clock in, the words out. The waiting panel
// (components/wait-panel.tsx) renders a guide; the rows of /mine and /maker print the one-line form.
// tests/unit/guide.test.mjs runs every state for every role. Nothing here may promise what
// contracts/commission_clock.py does not do.

import { acceptSplit, cancelOpensIn, graceLeft, lateTerms, live, silenceOpensIn, type ClockState } from "./clock.ts";
import { clockTime, gen, pct, span } from "./format.ts";
import { ACCEPT_WINDOW, KILL_BPS, TURN_GRACE, TURN_NOTICE, type CommissionStatus, type Holder, type Side } from "./rules.ts";
import type { WriteFn } from "./types.ts";

/** Who is looking: the client of the commission, its maker, or anyone else. */
export type Role = "client" | "maker" | "visitor";

/** Whose move it is now, for the panel's kicker. */
export type Waiter = "you" | "maker" | "client" | "validators" | "demo" | "nobody" | "done";

export type GuideTone = "busy" | "clock" | "late" | "ready" | "done";

export type Guide = {
  /** a stable name for the state, written on the panel for tests and tools */
  id: string;
  tone: GuideTone;
  waitsFor: Waiter;
  /** the small capitals above the line: who it waits for */
  kicker: string;
  /** 1. what is happening now */
  now: string;
  /** 2. how long it usually takes, or the exact time */
  time: string;
  /** 3. what is needed from the viewer right now */
  need: string;
  /** 4. who the clock runs against right now */
  clock: string;
  /** 5. whether the viewer can close the page, and where the thing stays */
  leave: string;
  canLeave: boolean;
  /** 6. where the fee is right now, with the amount */
  money: string;
  /** one more sentence when the state needs it */
  note?: string;
  /** seconds until the next thing happens on the contract's clock, for a countdown */
  left?: number;
  leftLabel?: string;
};

export const KICKERS: Record<Waiter, string> = {
  you: "Your move",
  maker: "The maker's move",
  client: "The client's move",
  validators: "Waiting for the validators",
  demo: "Waiting for the demo maker",
  nobody: "Nothing is waiting on you",
  done: "Settled · nothing left to do",
};

export const NOTHING_NEEDED = "Nothing is needed from you.";
export const NOTHING_LEFT = "Nothing is left to do here.";
export const NO_CLOCK = "No clock runs: it starts only when the maker accepts.";
export const CLOCK_STOPPED = "The clock is stopped for good: the commission is settled.";

type Lines = Omit<Guide, "kicker"> & { kicker?: string };
const make = (g: Lines): Guide => ({ ...g, kicker: g.kicker ?? KICKERS[g.waitsFor] });

const ABOUT_30 = (mock?: boolean) => (mock ? "A few seconds in this demo build; about 30 seconds on Studio." : "About 30 seconds.");
const JUDGING_TIME = (mock?: boolean) =>
  mock
    ? "A few seconds in this demo build; 1 to 3 minutes on Studio, where every validator asks its own model."
    : "Usually 1 to 3 minutes: every validator asks its model four questions about the brief, the thread and the message.";
const READING_TIME = (mock?: boolean) =>
  mock
    ? "A few seconds in this demo build; 2 to 5 minutes on Studio, where every validator fetches the page itself."
    : "Usually 2 to 5 minutes: every validator fetches the page itself and asks its model four questions about it.";

/** "You can close this page; C4 stays under My commissions" (no full stop). */
function keep(id: string, role: Role): string {
  if (role === "client") return `You can close this page; ${id} stays under My commissions`;
  if (role === "maker") return `You can close this page; ${id} stays on your maker's desk`;
  return "You can close this page and come back to this address later";
}

const sideName = (s: Side, role: Role): string => (role === s ? "you" : `the ${s}`);
const runsAgainst = (holder: Holder, role: Role): string =>
  holder ? `The clock runs against ${sideName(holder, role)}${role !== holder && role !== "visitor" ? ", not you" : ""}.` : NO_CLOCK;

// ---- the wallet prompt --------------------------------------------------------------------------------

export type SignInput = {
  fn: WriteFn;
  /** what the call does, e.g. "Commissioning S1 for 0.5 GEN" */
  label: string;
  /** the fee sent or held */
  feeAtto?: string;
  /** a settlement's split, worked out on the clock as the button was pressed */
  toMakerAtto?: string;
  toClientAtto?: string;
  /** who holds the move now, for the clock line */
  holder?: Holder;
  role?: Role;
  mock?: boolean;
};

/** Where the money is while a signature is waiting: nothing has moved yet. */
function moneyBeforeSigning(s: SignInput): string {
  const fee = gen(s.feeAtto ?? "0");
  const toMaker = gen(s.toMakerAtto ?? "0");
  const toClient = gen(s.toClientAtto ?? "0");
  switch (s.fn) {
    case "request_commission":
      return `${fee} is still in your wallet. Once you confirm it is held by the contract, not paid to the maker, until the commission settles; a refused request sends all of it back in the same transaction.`;
    case "withdraw_request":
      return `The contract holds your ${fee}; withdrawing sends all of it back to you.`;
    case "decline":
      return `The contract holds the client's ${fee}; declining sends all of it back to the client.`;
    case "accept":
      return `Accepting sends no GEN. The client's ${fee} stays held by the contract until the commission settles.`;
    case "say":
    case "deliver":
    case "take_move":
      return `No GEN moves with this. The ${fee} fee stays held by the contract until the commission settles.`;
    case "accept_work":
      return `From the ${fee} the contract holds: ${toMaker} to the maker and ${toClient} back to you, in the same transaction.`;
    case "claim_silence":
      return `From the ${fee} the contract holds: ${toMaker} to you and ${toClient} to the client, in the same transaction.`;
    case "cancel_late":
      return `From the ${fee} the contract holds: ${toClient} back to you and ${toMaker} to the maker, in the same transaction.`;
    case "open_studio":
    case "close_studio":
    case "reopen_studio":
      return "This sends no GEN; a studio holds nothing until a client commissions it.";
  }
}

function clockBeforeSigning(s: SignInput): string {
  const role = s.role ?? "visitor";
  switch (s.fn) {
    case "open_studio":
    case "close_studio":
    case "reopen_studio":
      return "No clock runs on a studio: each commission has its own, from the moment its maker accepts.";
    case "request_commission":
    case "withdraw_request":
    case "decline":
      return NO_CLOCK;
    case "accept":
      return "Once this lands the clock starts, with the move on you.";
    case "accept_work":
    case "claim_silence":
    case "cancel_late":
      return `${runsAgainst(s.holder ?? "", role)} It stops for good once this lands.`;
    default:
      return runsAgainst(s.holder ?? "", role);
  }
}

/** A transaction is waiting for the visitor's signature (in mock mode: being sent, a moment). */
export function signGuide(s: SignInput): Guide {
  const money = moneyBeforeSigning(s);
  const clock = clockBeforeSigning(s);
  if (s.mock)
    return make({
      id: "sign",
      tone: "busy",
      waitsFor: "validators",
      kicker: "Sending",
      now: `${s.label}…`,
      time: "A moment in this demo build.",
      need: NOTHING_NEEDED,
      clock,
      leave: "Stay on this page for a moment.",
      canLeave: false,
      money,
    });
  return make({
    id: "sign",
    tone: "busy",
    waitsFor: "you",
    kicker: "Your wallet",
    now: `Your wallet is asking you to confirm: ${s.label}`,
    time: "Until you confirm or reject it in the wallet.",
    need: "Confirm it in your wallet, or reject it and nothing is sent.",
    clock,
    leave: "Stay on this page until you have answered the wallet; this page then follows the transaction for you.",
    canLeave: false,
    money,
  });
}

// ---- a plain transaction on its way ---------------------------------------------------------------------

export type SendingInput = {
  fn: Exclude<WriteFn, "say" | "deliver">;
  /** "S2" or "C7": what the call is about */
  target: string;
  /** a studio's name */
  title?: string;
  feeAtto?: string;
  toMakerAtto?: string;
  toClientAtto?: string;
  holder?: Holder;
  role?: Role;
  mock?: boolean;
};

/** Every call the validators do not judge with a model: sent, not final yet. */
export function sendingGuide(s: SendingInput): Guide {
  const fee = gen(s.feeAtto ?? "0");
  const role = s.role ?? "visitor";
  const base = { tone: "busy" as const, waitsFor: "validators" as const, time: ABOUT_30(s.mock), need: NOTHING_NEEDED, canLeave: true };
  const lands = (what: string) => `You can close this page; ${what} lands whether or not this page is open.`;
  switch (s.fn) {
    case "open_studio":
      return make({ ...base, id: "open_studio", now: `Opening ${s.title || "your studio"}`, clock: clockBeforeSigning({ fn: s.fn, label: "" }), leave: "You can close this page; once it lands, the studio stays on your maker's desk.", money: "Opening a studio sends no GEN; its terms are fixed for good." });
    case "close_studio":
      return make({ ...base, id: "close_studio", now: `Closing ${s.target} to new commissions`, clock: "Commissions already running keep their own clocks.", leave: lands("the change"), money: "Closing sends no GEN; every fee already held stays held until its commission settles." });
    case "reopen_studio":
      return make({ ...base, id: "reopen_studio", now: `Opening ${s.target} to new commissions again`, clock: clockBeforeSigning({ fn: s.fn, label: "" }), leave: lands("the change"), money: "Reopening sends no GEN." });
    case "request_commission":
      return make({
        ...base,
        id: "request_commission",
        now: `Commissioning ${s.title || s.target}: the validators are checking the request`,
        clock: NO_CLOCK,
        leave: "You can close this page; once it lands, the commission stays under My commissions. Stay here and its room opens by itself.",
        money: `${fee} goes from your wallet to the contract, which holds it until the commission settles. A refused request sends all of it back in the same transaction.`,
      });
    case "withdraw_request":
      return make({ ...base, id: "withdraw_request", now: `Withdrawing ${s.target} before the maker accepts it`, clock: NO_CLOCK, leave: lands("the withdrawal"), money: `${fee} is on its way back from the contract to your wallet.` });
    case "decline":
      return make({ ...base, id: "decline", now: `Declining ${s.target}`, clock: NO_CLOCK, leave: lands("the decline"), money: `${fee} is on its way back from the contract to the client.` });
    case "accept":
      return make({ ...base, id: "accept", now: `Accepting ${s.target}: the clock starts with the move on the maker`, clock: "From this transaction's own time the clock runs against the maker.", leave: lands("the acceptance"), money: `The client's ${fee} stays held by the contract until the commission settles.` });
    case "take_move":
      return make({ ...base, id: "take_move", now: `Taking the move on ${s.target}`, clock: `Once it lands the clock runs against ${role === "visitor" ? "the side that took it" : "you"}, from this transaction's own time.`, leave: lands("it"), money: `No GEN moves. The ${fee} fee stays held by the contract.` });
    case "accept_work":
    case "claim_silence":
    case "cancel_late": {
      const what = s.fn === "accept_work" ? "Accepting the work" : s.fn === "claim_silence" ? "Claiming the client's silence" : "Cancelling late";
      return make({
        ...base,
        id: s.fn,
        now: `${what} on ${s.target}: the fee is being paid out`,
        clock: `${runsAgainst(s.holder ?? "", role)} It stops for good once this lands.`,
        leave: lands("the settlement"),
        money: `From the ${fee} the contract holds: about ${gen(s.toMakerAtto ?? "0")} to the maker and ${gen(s.toClientAtto ?? "0")} to the client, worked out on the transaction's own clock.`,
      });
    }
  }
}

/** A final transaction whose effect is not on screen yet: a few seconds. */
export function updatingGuide(what: string): Guide {
  return make({
    id: "updating",
    tone: "busy",
    waitsFor: "nobody",
    kicker: "Final",
    now: what,
    time: "A few seconds.",
    need: NOTHING_NEEDED,
    clock: "The clock below catches up in a moment.",
    leave: "You can close this page; the transaction is final. Stay a few seconds to see it here.",
    canLeave: true,
    money: "The transaction is final; this page shows where the fee is in a moment.",
  });
}

// ---- a press: the validators judge whether a message hands the move over --------------------------------

export type JudgeInput = {
  role: Role;
  /** "C4" */
  commission: string;
  /** the side that pressed */
  presser: Side;
  feeAtto: string;
  /** "busy" while it runs, "late" after six minutes */
  stage: "busy" | "late";
  mock?: boolean;
};

/** A message from the side that holds the move: every validator asks four questions about it. */
export function judgeGuide(j: JudgeInput): Guide {
  const late = j.stage === "late";
  const mine = j.role === j.presser;
  const to = j.presser === "maker" ? "client" : "maker";
  return make({
    id: late ? "judging-late" : "judging",
    tone: late ? "late" : "busy",
    waitsFor: "validators",
    now: late
      ? `The validators are still judging ${mine ? "your" : `the ${j.presser}'s`} message`
      : `The validators are judging ${mine ? "your" : `the ${j.presser}'s`} message: does it hand the move to the ${to}?`,
    time: late
      ? "Over 6 minutes so far. Studio is slow at times; the verdict still lands here by itself. A round that cannot settle stores nothing, and the message may be sent again."
      : JUDGING_TIME(j.mock),
    need: NOTHING_NEEDED,
    clock: `The clock runs against ${sideName(j.presser, j.role)} up to this transaction's own time. If the press counts, the move goes to ${sideName(to, j.role)} from that time, with its first ${TURN_GRACE / 60} minutes not charged while the round finishes.`,
    leave: `${keep(j.commission, j.role)}; the verdict lands whether or not this page is open.`,
    canLeave: true,
    money: `No GEN moves with a message. The ${gen(j.feeAtto)} fee stays held by the contract until the commission settles.`,
  });
}

/** A message from the side that does not hold the move: recorded as noted, nobody is asked. */
export function noteGuide(j: { role: Role; commission: string; sender: Side; holder: Holder; feeAtto: string; mock?: boolean }): Guide {
  return make({
    id: "noting",
    tone: "busy",
    waitsFor: "validators",
    now: `Recording ${j.role === j.sender ? "your" : `the ${j.sender}'s`} message as noted: ${j.role === j.sender ? "you do" : `the ${j.sender} does`} not hold the move, so nobody is asked`,
    time: ABOUT_30(j.mock),
    need: NOTHING_NEEDED,
    clock: `${runsAgainst(j.holder, j.role)} A noted message does not stop it.`,
    leave: `${keep(j.commission, j.role)}; the message lands whether or not this page is open.`,
    canLeave: true,
    money: `No GEN moves with a message. The ${gen(j.feeAtto)} fee stays held by the contract until the commission settles.`,
  });
}

export type ReadInput = {
  role: Role;
  commission: string;
  /** what the thread calls the page, e.g. "mug-final.html" */
  page: string;
  feeAtto: string;
  /** who holds the move now */
  holder: Holder;
  stage: "busy" | "late";
  mock?: boolean;
};

/** A delivery: every validator opens the page on the live web and asks four questions about it. */
export function readGuide(r: ReadInput): Guide {
  const late = r.stage === "late";
  return make({
    id: late ? "reading-late" : "reading",
    tone: late ? "late" : "busy",
    waitsFor: "validators",
    now: late ? `The validators are still reading ${r.page}` : `The validators are opening ${r.page} on the live web and reading it`,
    time: late
      ? "Over 6 minutes so far. Studio is slow at times; the verdict still lands here by itself. A page that cannot be read stores nothing, and the delivery may be made again."
      : READING_TIME(r.mock),
    need: NOTHING_NEEDED,
    clock:
      r.holder === "maker"
        ? `The clock runs against ${sideName("maker", r.role)} up to this transaction's own time. Read as delivered, the move goes to ${sideName("client", r.role)} for the review, its first ${TURN_GRACE / 60} minutes not charged; read as missing, it stays with the maker.`
        : `${runsAgainst(r.holder, r.role)} A delivery does not change that; it only records the newest finished page.`,
    leave: `${keep(r.commission, r.role)}; the verdict lands whether or not this page is open.`,
    canLeave: true,
    money: `No GEN moves with a delivery. The ${gen(r.feeAtto)} fee stays held by the contract until the commission settles.`,
  });
}

// ---- the demo maker at work -------------------------------------------------------------------------

export type DemoInput = { state: "asking" | "failed"; what: string; commission: string; holder: Holder; feeAtto: string; reason?: string; mock?: boolean };

/** The visitor asked the demo maker to do something: it signs with its own key, from a fixed script. */
export function demoGuide(d: DemoInput): Guide {
  if (d.state === "failed")
    return make({
      id: "demo-failed",
      tone: "late",
      waitsFor: "demo",
      now: "The demo maker did not act",
      time: "Try again in a minute.",
      need: "Press the button again, or take another step yourself.",
      clock: runsAgainst(d.holder, "client"),
      leave: "You can close this page; nothing was sent from your wallet.",
      canLeave: true,
      money: `Your wallet is untouched. The ${gen(d.feeAtto)} fee stays held by the contract.`,
      note: d.reason,
    });
  return make({
    id: "demo-asking",
    tone: "busy",
    waitsFor: "demo",
    now: `The demo maker is signing: ${d.what}`,
    time: ABOUT_30(d.mock) + " Then the network takes its usual time.",
    need: NOTHING_NEEDED,
    clock: runsAgainst(d.holder, "client"),
    leave: "Stay a few seconds while the demo maker sends it; then this page follows the transaction for you.",
    canLeave: false,
    money: `Your wallet is untouched: the demo maker signs with its own key. The ${gen(d.feeAtto)} fee stays held by the contract.`,
  });
}

// ---- one commission, on the clock ----------------------------------------------------------------------

export type CommissionInput = {
  role: Role;
  /** the contract's clock, seconds */
  now: number;
  id: string;
  status: CommissionStatus;
  clock: ClockState;
  feeAtto: string;
  deliveries: number;
  requestedAt: number;
  makerPaidAtto: string;
  clientPaidAtto: string;
  makerLate: number;
  cutBpsTotal: number;
  /** a commission of the demo studio, whose maker acts when its buttons are pressed */
  demo?: boolean;
  mock?: boolean;
};

const used = (n: number, of: number) => `${span(n)} of ${span(of)}`;

/** Every state of one commission, for its client, its maker or anyone else. */
export function commissionGuide(g: CommissionInput): Guide {
  const fee = gen(g.feeAtto);
  const stays = keep(g.id, g.role);
  const c = g.clock;
  const at = (x: number) => clockTime(x, g.now);

  // ---- settled ----
  if (g.status === "accepted" || g.status === "accepted_by_silence") {
    const silent = g.status === "accepted_by_silence";
    const late = g.makerLate > 0;
    return make({
      id: g.status,
      tone: "done",
      waitsFor: "done",
      kicker: silent ? "Settled by the client's silence" : "Accepted · settled",
      now: silent
        ? `The client went silent after a delivery; the maker settled it as accepted: ${gen(g.makerPaidAtto)} to the maker`
        : `The client accepted the work: ${gen(g.makerPaidAtto)} to the maker`,
      time: late ? `The maker finished ${span(g.makerLate)} over its allowance: a cut of ${pct(g.cutBpsTotal)} of the fee.` : "The maker finished inside its allowance: no cut.",
      need: NOTHING_LEFT,
      clock: CLOCK_STOPPED,
      leave: `${stays}.`,
      canLeave: true,
      money: `Paid out of the ${fee} in one transaction: ${gen(g.makerPaidAtto)} to the maker, ${gen(g.clientPaidAtto)} back to the client. The contract holds nothing for ${g.id}.`,
    });
  }
  if (g.status === "lapsed")
    return make({
      id: "lapsed",
      tone: "done",
      waitsFor: "done",
      kicker: "Lapsed · settled",
      now: `The client went silent before any delivery: the maker took a kill fee of ${gen(g.makerPaidAtto)}`,
      time: `The kill fee is ${pct(KILL_BPS)} of the fee, never more than the fee less the maker's own late cut.`,
      need: NOTHING_LEFT,
      clock: CLOCK_STOPPED,
      leave: `${stays}.`,
      canLeave: true,
      money: `Paid out of the ${fee}: ${gen(g.makerPaidAtto)} to the maker, ${gen(g.clientPaidAtto)} back to the client. The contract holds nothing for ${g.id}.`,
    });
  if (g.status === "cancelled_late")
    return make({
      id: "cancelled_late",
      tone: "done",
      waitsFor: "done",
      kicker: "Cancelled late · settled",
      now:
        g.deliveries > 0
          ? `The client cancelled once the maker's cut reached its cap; a delivery was recorded, so it settled as accepted at the cap`
          : `The client cancelled once the maker's cut reached its cap: the whole fee went back to the client`,
      time: `The maker was ${span(g.makerLate)} over its allowance: a cut of ${pct(g.cutBpsTotal)}.`,
      need: NOTHING_LEFT,
      clock: CLOCK_STOPPED,
      leave: `${stays}.`,
      canLeave: true,
      money: `Paid out of the ${fee}: ${gen(g.makerPaidAtto)} to the maker, ${gen(g.clientPaidAtto)} back to the client. The contract holds nothing for ${g.id}.`,
    });
  if (g.status === "withdrawn" || g.status === "declined")
    return make({
      id: g.status,
      tone: "done",
      waitsFor: "done",
      kicker: g.status === "withdrawn" ? "Withdrawn · settled" : "Declined · settled",
      now: g.status === "withdrawn" ? "The client withdrew the request before the maker accepted it" : "The maker declined the request",
      time: "No clock ever ran.",
      need: NOTHING_LEFT,
      clock: CLOCK_STOPPED,
      leave: `${stays}.`,
      canLeave: true,
      money: `The whole ${fee} went back to the client in the same transaction. The contract holds nothing for ${g.id}.`,
    });

  // ---- requested ----
  if (g.status === "requested") {
    const closes = g.requestedAt + ACCEPT_WINDOW;
    const left = closes - g.now;
    if (left < 0)
      return make({
        id: "requested-expired",
        tone: "late",
        waitsFor: g.role === "client" ? "you" : "nobody",
        kicker: "Too late to accept",
        now: `${g.id} was not accepted within seven days and can no longer be accepted`,
        time: `The window closed at ${at(closes)}.`,
        need:
          g.role === "client"
            ? "Withdraw it: the whole fee comes back to you."
            : g.role === "maker"
              ? "Decline it to send the fee back now; the client can also withdraw it."
              : NOTHING_NEEDED,
        clock: NO_CLOCK,
        leave: `${stays}; the fee waits for a withdrawal or a decline.`,
        canLeave: true,
        money: `The client's ${fee} is held by the contract; a withdrawal or a decline sends all of it back to the client.`,
      });
    if (g.role === "maker")
      return make({
        id: "requested",
        tone: "ready",
        waitsFor: "you",
        kicker: "A request for your studio",
        now: `${g.id} asks for your work: accept it to start the clock, or decline it`,
        time: `You can accept until ${at(closes)} (${span(left)} left); after that only decline.`,
        need: "Accept or decline. The clock starts with the move on you the moment your acceptance lands.",
        clock: NO_CLOCK,
        leave: `${stays}.`,
        canLeave: true,
        money: `The client's ${fee} is held by the contract, not paid to you yet. A decline sends all of it back to the client.`,
        left,
        leftLabel: "to accept",
      });
    return make({
      id: "requested",
      tone: "clock",
      waitsFor: "maker",
      kicker: "Waiting for the maker to accept",
      now: g.role === "client" ? `${g.id} waits for the maker to accept it` : `${g.id} waits for its maker to accept it`,
      time: g.demo
        ? `The demo maker accepts when you press its button below, in about half a minute. A maker has until ${at(closes)} to accept.`
        : `The maker has until ${at(closes)} (${span(left)} left) to accept; after that it can only be withdrawn or declined.`,
      need:
        g.role === "client"
          ? g.demo
            ? "Press \"Ask the demo maker to accept\", or withdraw: the whole fee comes back."
            : "Nothing, unless you change your mind: withdrawing gives the whole fee back."
          : NOTHING_NEEDED,
      clock: NO_CLOCK,
      leave: `${stays}.`,
      canLeave: true,
      money: `${g.role === "client" ? "Your" : "The client's"} ${fee} is held by the contract, not by the maker. A withdrawal or a decline sends all of it back.`,
      left: g.demo ? undefined : left,
      leftLabel: "to accept",
    });
  }

  // ---- active ----
  const holder = c.holder || "maker";
  const graceSecs = graceLeft(c, g.now);
  const makerLive = live(c, "maker", g.now);
  const clientLive = live(c, "client", g.now);
  const { late, total } = lateTerms(c, g.now);
  const graceWords = graceSecs > 0 ? ` The first ${TURN_GRACE / 60} minutes of this turn are not charged: ${span(graceSecs)} to go.` : "";

  if (holder === "maker") {
    const opens = cancelOpensIn(c, g.now);
    const atCap = total >= c.maxCutBps;
    const over = late > 0;
    const makerTimeFor = (you: boolean) =>
      over
        ? `${you ? "You are" : "The maker is"} ${span(late)} over ${you ? "your" : "its"} ${span(c.makerSeconds)}: the cut is ${pct(total)} of the fee now, at most ${pct(c.maxCutBps)}.`
        : `${you ? "You have" : "The maker has"} used ${used(makerLive, c.makerSeconds)}; ${span(c.makerSeconds - makerLive)} left before the late cut starts.`;
    const makerTime = makerTimeFor(false);
    const split = acceptSplit(c, BigInt(g.feeAtto || "0"), g.now);
    const cutLine = over ? ` At this moment ${gen(split.toClient)} of it would come back to the client as the late cut.` : "";
    if (g.role === "maker")
      return make({
        id: over ? (opens === 0 ? "maker-move-cancel-open" : "maker-move-over") : "maker-move",
        tone: over ? "late" : "clock",
        waitsFor: "you",
        now: over ? "Your move, and you are over your allowance" : "Your move: the clock runs against you",
        time: makerTimeFor(true) + graceWords,
        need: "Ask a real question, answer, or deliver the work. A promise or a question the brief already answers keeps the move with you.",
        clock: "The clock runs against you, not the client." + (opens === 0 ? " The client may cancel now: your cut is at its cap." : over && atCap ? ` The client may cancel in ${span(opens)} if you do not move.` : ""),
        leave: `${stays}, but your clock keeps running while the move is yours.`,
        canLeave: true,
        money: `The client's ${fee} is held by the contract until the commission settles.${cutLine}`,
        left: over ? opens || undefined : Math.max(1, c.makerSeconds - makerLive + graceSecs),
        leftLabel: over ? "until cancel opens" : "before your cut starts",
      });
    if (g.role === "client")
      return make({
        id: opens === 0 ? "maker-move-cancel-open" : over ? "maker-move-over" : "maker-move",
        tone: opens === 0 ? "ready" : over ? "late" : "clock",
        waitsFor: "maker",
        now: opens === 0 ? "The maker's cut has reached its cap: you may cancel" : over ? "The maker is over its allowance" : "The maker's move: the clock runs against the maker",
        time: makerTime + graceWords,
        need:
          opens === 0
            ? g.deliveries > 0
              ? "You may cancel now; a delivery is recorded, so it settles as accepted at the cap. Or wait for the maker."
              : "You may cancel now and have the whole fee back, or keep waiting for the maker."
            : `Nothing is needed from you. A message from you now is noted and does not stop the maker's clock.${g.demo ? " The demo maker's buttons below show what it can do next." : ""}`,
        clock: "The clock runs against the maker, not you." + (opens > 0 && (over || atCap) ? ` Cancel opens in ${span(opens)} if the maker does not move.` : ""),
        leave: `${stays}; only the maker's clock runs.`,
        canLeave: true,
        money: `Your ${fee} is held by the contract until the commission settles.${cutLine}`,
        left: opens > 0 && over ? opens : undefined,
        leftLabel: "until you may cancel",
      });
    return make({
      id: over ? "maker-move-over" : "maker-move",
      tone: over ? "late" : "clock",
      waitsFor: "maker",
      now: "The maker's move: the clock runs against the maker",
      time: makerTime + graceWords,
      need: NOTHING_NEEDED,
      clock: "The clock runs against the maker.",
      leave: `${stays}.`,
      canLeave: true,
      money: `The client's ${fee} is held by the contract until the commission settles.`,
    });
  }

  // the client holds the move
  const opens = silenceOpensIn(c, g.now);
  const over = clientLive > c.clientSeconds;
  const reviewing = g.deliveries > 0;
  const clientTimeFor = (you: boolean) =>
    over
      ? `${you ? "You are" : "The client is"} ${span(clientLive - c.clientSeconds)} past ${you ? "your" : "its"} ${span(c.clientSeconds)} for answers and reviews.`
      : `${you ? "You have" : "The client has"} used ${used(clientLive, c.clientSeconds)} for answers and reviews.`;
  const clientTime = clientTimeFor(false);
  const silenceLine = opens === 0 ? "silence can be claimed now" : `silence can be claimed in ${span(opens)} if the client does not move`;
  const silenceMoney = reviewing
    ? "with a delivery recorded it settles as if accepted"
    : `without a delivery the maker takes a kill fee of ${pct(KILL_BPS)} and the rest goes back to the client`;
  if (g.role === "client")
    return make({
      id: opens === 0 ? "client-move-silence-open" : over ? "client-move-over" : reviewing ? "client-review" : "client-move",
      tone: opens === 0 || over ? "late" : "clock",
      waitsFor: "you",
      now: reviewing ? "Your move: the maker delivered, the work is yours to review" : "Your move: the maker is waiting for you",
      time: clientTimeFor(true) + graceWords,
      need: reviewing
        ? "Accept the work, or ask for specific changes: a concrete revision hands the move back. Praise or a promise keeps it with you."
        : "Answer the maker: a concrete answer hands the move back. \"I'll get back to you\" keeps it with you.",
      clock:
        "The clock runs against you, not the maker." +
        (over || opens === 0 ? ` You are past your allowance: once this turn has been charged ${TURN_NOTICE / 60} minutes the maker may claim your silence; ${opens === 0 ? "it can now" : `in ${span(opens)}`}.` : ""),
      leave: `${stays}, but your clock keeps running while the move is yours.`,
      canLeave: true,
      money: `Your ${fee} is held by the contract until the commission settles. If the maker claims your silence, ${silenceMoney}.`,
      left: over || opens < 3600 ? opens || undefined : Math.max(1, c.clientSeconds - clientLive + graceSecs),
      leftLabel: over || opens < 3600 ? "until silence can be claimed" : "of your allowance",
    });
  if (g.role === "maker")
    return make({
      id: opens === 0 ? "client-move-silence-open" : over ? "client-move-over" : reviewing ? "client-review" : "client-move",
      tone: opens === 0 ? "ready" : "clock",
      waitsFor: "client",
      now: opens === 0 ? "The client is past its allowance: you may claim its silence" : reviewing ? "The client's move: your delivery is with the client for review" : "The client's move: your clock is stopped",
      time: clientTime + graceWords,
      need: opens === 0 ? `Claim the client's silence if you want to settle: ${silenceMoney}. Or keep waiting.` : NOTHING_NEEDED,
      clock: `The clock runs against the client, not you; ${silenceLine}.`,
      leave: `${stays}; your clock does not run while the client holds the move.`,
      canLeave: true,
      money: `The client's ${fee} is held by the contract until the commission settles.`,
      left: opens || undefined,
      leftLabel: "until you may claim silence",
    });
  return make({
    id: reviewing ? "client-review" : "client-move",
    tone: "clock",
    waitsFor: "client",
    now: "The client's move: the clock runs against the client",
    time: clientTime + graceWords,
    need: NOTHING_NEEDED,
    clock: `The clock runs against the client; ${silenceLine}.`,
    leave: `${stays}.`,
    canLeave: true,
    money: `The client's ${fee} is held by the contract until the commission settles.`,
  });
}

/** The one-line form of a commission's state, for the rows of /mine and /maker. */
export function commissionLine(g: CommissionInput): string {
  return commissionGuide(g).now;
}
