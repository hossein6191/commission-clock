// The bonded appeal, as the contract decides it: which side a judged verdict went against, who holds
// the move once a verdict is applied, whether a verdict can still be appealed by whom and for how long,
// which of the latest press and the latest delivery an appeal would reach, why an appeal would be
// refused before it is sent, and when a settlement or a second delivery waits for an appeal window.
// Pure, so tests/unit/appeal.test.mjs checks it against contracts/commission_clock.py itself.

import { APPEAL_BOND, APPEAL_WINDOW, other, type AppealWord, type CommissionStatus, type Holder, type MessageKind, type Side } from "./rules.ts";

/** The contract's _appellant: the side a judged verdict went against, the only side that may appeal it. */
export function appellantOf(kind: MessageKind, verdict: string, role: Side): Side {
  if (kind === "say") return verdict === "pass" ? other(role) : role;
  return verdict === "delivered" ? "client" : "maker";
}

/** The contract's _holder_after: who holds the move once a verdict is applied to a commission whose holder was `before`. */
export function holderAfter(kind: MessageKind, verdict: string, role: Side, before: Holder): Holder {
  if (kind === "say") return verdict === "pass" ? other(role) : role;
  return verdict === "delivered" && before === "maker" ? "client" : before;
}

/** The latest judged press or delivery as commission(id) shows it: its verdict and its appeal. */
export type VerdictView = {
  /** "C4#3" */
  message: string;
  n: number;
  kind: MessageKind;
  /** the verdict as it stands */
  verdict: string;
  /** the first verdict, once an appeal replaced it; "" otherwise */
  was: string;
  /** the side the first verdict went against */
  appellant: Side;
  /** the last second an appeal can be sent: the verdict's own time plus APPEAL_WINDOW */
  deadline: number;
  /** what the appeal came to; "" while there is none */
  appeal: AppealWord;
  appealRole: Side | "";
  /** the view's own answer at its clock */
  open: boolean;
};

/** The side that wrote a judged message, from its kind, its first verdict and the side it went against. */
export function authorOf(v: Pick<VerdictView, "kind" | "verdict" | "was" | "appellant">): Side {
  if (v.kind === "deliver") return "maker";
  const first = v.was || v.verdict;
  return first === "pass" ? other(v.appellant) : v.appellant;
}

/** The contract's _open_appeal at `now`: the side that may still appeal this verdict, or "" when nobody may. */
export function openAppeal(v: VerdictView | null, now: number, status: CommissionStatus): Side | "" {
  if (!v || status !== "active") return "";
  if (v.appeal !== "" || now > v.deadline) return "";
  return v.appellant;
}

/** Seconds left to appeal at `now`; 0 once the window has closed or the verdict was appealed. */
export const appealLeft = (v: VerdictView | null, now: number): number => (v && v.appeal === "" ? Math.max(0, v.deadline - now) : 0);

/** The contract's _appealable: the message `role` may appeal now, the later of the two when both went against it; null when none. */
export function appealTarget(press: VerdictView | null, delivery: VerdictView | null, role: Side, now: number, status: CommissionStatus): VerdictView | null {
  const p = openAppeal(press, now, status) === role ? press : null;
  const d = openAppeal(delivery, now, status) === role ? delivery : null;
  if (p && d) return p.n > d.n ? p : d;
  return p ?? d;
}

export type AppealCheck = { ok: true; target: VerdictView } | { ok: false; why: string };

/**
 * Why appeal() would be refused right now, in the order the contract checks, before anything is signed;
 * or the verdict it would reach. `credit` is the caller's credit in atto.
 */
export function appealCheck(a: {
  role: Side | "visitor";
  status: CommissionStatus;
  id: string;
  press: VerdictView | null;
  delivery: VerdictView | null;
  now: number;
  credit: bigint;
}): AppealCheck {
  if (a.role === "visitor") return { ok: false, why: `Only the maker or the client of ${a.id} may appeal a verdict on it.` };
  if (a.status !== "active") return { ok: false, why: `${a.id} is ${a.status}; a verdict is appealed while it is active.` };
  const target = appealTarget(a.press, a.delivery, a.role, a.now, a.status);
  if (!target) {
    for (const v of [a.delivery, a.press])
      if (v && v.appeal !== "" && v.appealRole === a.role && a.now <= v.deadline)
        return { ok: false, why: `The verdict on ${v.message} was appealed once already; an appeal is final and is never appealed again.` };
    const against = [a.press, a.delivery].some((v) => v && v.appeal === "" && a.now <= v.deadline && v.appellant !== a.role);
    if (against) return { ok: false, why: `The latest verdict went your way, so only the ${other(a.role)} may appeal it.` };
    return { ok: false, why: `No verdict that went against you can be appealed now: a verdict is appealed once, within ${APPEAL_WINDOW / 60} minutes, and only the latest judged message and the latest judged delivery can be.` };
  }
  if (a.credit < APPEAL_BOND) return { ok: false, why: "An appeal puts up a bond of 0.1 GEN from your credit, and your credit is less than that: deposit first." };
  return { ok: true, target };
}

/**
 * The contract's _wait_for_appeal: the deadline a settlement by `settler` waits for, because the other
 * side may still appeal a verdict on one of the settler's own messages; 0 when it waits for nothing.
 */
export function settleWaitsUntil(press: VerdictView | null, delivery: VerdictView | null, settler: Side, now: number, status: CommissionStatus): number {
  let until = 0;
  for (const v of [press, delivery]) {
    const who = openAppeal(v, now, status);
    if (v && who !== "" && who !== settler && authorOf(v) === settler) until = Math.max(until, v.deadline);
  }
  return until;
}

/**
 * The contract's _no_redelivery: the deadline before the maker may deliver again, while the client may
 * appeal a delivered page for the current stage and has written nothing since; 0 when it may now.
 */
export function redeliverWaitsUntil(delivery: VerdictView | null, deliveryStage: number, currentStage: number, clientWroteSince: boolean, now: number, status: CommissionStatus): number {
  if (!delivery || clientWroteSince || deliveryStage !== currentStage) return 0;
  return openAppeal(delivery, now, status) === "client" ? delivery.deadline : 0;
}

/** What an appeal came to, in a few words, for the verdict card. */
export function appealWords(v: VerdictView): string {
  if (!v.appeal) return "";
  const by = v.appealRole ? `the ${v.appealRole}` : "a party";
  if (v.was) return `Overturned on appeal by ${by}: ${v.was} became ${v.verdict}${v.appeal === "changed" ? " (the page no longer read as it did when it was judged)" : ""}.`;
  return `Upheld on appeal by ${by}: ${v.verdict} again, and the bond went to the ${by === "the maker" ? "client" : by === "the client" ? "maker" : "other side"}.`;
}
