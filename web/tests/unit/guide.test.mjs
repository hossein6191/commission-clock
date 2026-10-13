// The waiting copy (lib/guide.ts) for every in-between state of the site and every role: what is
// happening, how long, what is needed, who the clock runs against, whether the page can be closed
// and where the fee is, never empty, and never promising what the contract does not do.

import test from "node:test";
import assert from "node:assert/strict";

import * as g from "../../lib/guide.ts";
import { cancelOpensIn, silenceOpensIn } from "../../lib/clock.ts";
import { DEMO_TERMS } from "../../lib/demo-studio.ts";

const ROLES = ["client", "maker", "visitor"];
const FEE = DEMO_TERMS.feeAtto.toString();
const NOW = 1_800_000_000;

function lines(guide, where) {
  for (const k of ["id", "kicker", "now", "time", "need", "clock", "leave", "money"]) assert.ok(String(guide[k] ?? "").trim().length > 3, `${where}: ${k} is said`);
  assert.ok(["busy", "clock", "late", "ready", "done"].includes(guide.tone), `${where}: a known tone`);
  assert.equal(typeof guide.canLeave, "boolean", `${where}: whether the page can be closed`);
  for (const k of ["time", "need", "clock", "leave", "money"]) assert.match(guide[k], /[.)]$/, `${where}: ${k} is a sentence`);
  assert.doesNotMatch(guide.now, /\.$/, `${where}: the headline has no full stop`);
  assert.doesNotMatch(JSON.stringify(guide), /undefined|NaN|\[object/, `${where}: no unfilled value`);
}

const clock = (o = {}) => ({
  holder: "maker",
  since: NOW - 100,
  handedBy: 0,
  makerUsed: 0,
  clientUsed: 0,
  makerSeconds: DEMO_TERMS.makerSeconds,
  clientSeconds: DEMO_TERMS.clientSeconds,
  stepSeconds: DEMO_TERMS.stepSeconds,
  cutBps: DEMO_TERMS.cutBps,
  maxCutBps: DEMO_TERMS.maxCutBps,
  ...o,
});

const input = (role, status, c, o = {}) => ({
  role,
  now: NOW,
  id: "C7",
  status,
  clock: c,
  feeAtto: FEE,
  deliveries: 0,
  requestedAt: NOW - 600,
  makerPaidAtto: "0",
  clientPaidAtto: "0",
  makerLate: 0,
  cutBpsTotal: 0,
  ...o,
});

/** Every state a commission can be in, by name. */
const STATES = {
  requested: (r) => input(r, "requested", clock({ holder: "", since: 0 })),
  "requested, demo": (r) => input(r, "requested", clock({ holder: "", since: 0 }), { demo: true }),
  "requested, too late to accept": (r) => input(r, "requested", clock({ holder: "", since: 0 }), { requestedAt: NOW - 8 * 86400 }),
  "maker's move, first turn": (r) => input(r, "active", clock()),
  "maker's move, in its grace": (r) => input(r, "active", clock({ handedBy: 4, since: NOW - 60 })),
  "maker's move, over its allowance": (r) => input(r, "active", clock({ makerUsed: 1250 })),
  "maker's move, cut at the cap but its turn too new": (r) => input(r, "active", clock({ makerUsed: 1700, handedBy: 9, since: NOW - 30 })),
  "maker's move, cancel open": (r) => input(r, "active", clock({ makerUsed: 1700, since: NOW - 400 })),
  "maker's move, cancel open after a delivery": (r) => input(r, "active", clock({ makerUsed: 1700, since: NOW - 400 }), { deliveries: 1 }),
  "client's move, in its grace": (r) => input(r, "active", clock({ holder: "client", handedBy: 2, since: NOW - 20, makerUsed: 300 })),
  "client's move, charging": (r) => input(r, "active", clock({ holder: "client", handedBy: 2, since: NOW - 400, makerUsed: 300 })),
  "client's move, reviewing": (r) => input(r, "active", clock({ holder: "client", handedBy: 5, since: NOW - 400, makerUsed: 600 }), { deliveries: 1 }),
  "client's move, over its allowance": (r) => input(r, "active", clock({ holder: "client", handedBy: 2, since: NOW - 350, clientUsed: 590 })),
  "client's move, silence open": (r) => input(r, "active", clock({ holder: "client", handedBy: 2, since: NOW - 1000, clientUsed: 400 })),
  "client's move, silence open after a delivery": (r) => input(r, "active", clock({ holder: "client", handedBy: 2, since: NOW - 1000, clientUsed: 400 }), { deliveries: 1 }),
  accepted: (r) => input(r, "accepted", clock({ holder: "" }), { deliveries: 1, makerPaidAtto: FEE }),
  "accepted, late": (r) => input(r, "accepted", clock({ holder: "" }), { deliveries: 1, makerPaidAtto: "400000000000000000", clientPaidAtto: "100000000000000000", makerLate: 240, cutBpsTotal: 2000 }),
  accepted_by_silence: (r) => input(r, "accepted_by_silence", clock({ holder: "" }), { deliveries: 1, makerPaidAtto: FEE }),
  lapsed: (r) => input(r, "lapsed", clock({ holder: "" }), { makerPaidAtto: "125000000000000000", clientPaidAtto: "375000000000000000" }),
  "cancelled late": (r) => input(r, "cancelled_late", clock({ holder: "" }), { clientPaidAtto: FEE, makerLate: 500, cutBpsTotal: 5000 }),
  "cancelled late after a delivery": (r) => input(r, "cancelled_late", clock({ holder: "" }), { deliveries: 1, makerPaidAtto: "250000000000000000", clientPaidAtto: "250000000000000000", makerLate: 500, cutBpsTotal: 5000 }),
  withdrawn: (r) => input(r, "withdrawn", clock({ holder: "" }), { clientPaidAtto: FEE }),
  declined: (r) => input(r, "declined", clock({ holder: "" }), { clientPaidAtto: FEE }),
};

test("every state of a commission, for its client, its maker and anyone else, says all six things", () => {
  for (const [name, make] of Object.entries(STATES))
    for (const role of ROLES) {
      const guide = g.commissionGuide(make(role));
      lines(guide, `${name} / ${role}`);
      assert.equal(g.commissionLine(make(role)), guide.now);
    }
});

test("every open state says the fee is held by the contract, and every settled one where it went", () => {
  for (const [name, make] of Object.entries(STATES))
    for (const role of ROLES) {
      const i = make(role);
      const guide = g.commissionGuide(i);
      if (i.status === "requested" || i.status === "active") assert.match(guide.money, /held by the contract/, `${name} / ${role}`);
      else {
        assert.match(guide.money, /holds nothing for C7/, `${name} / ${role}`);
        assert.equal(guide.tone, "done");
        assert.equal(guide.clock, g.CLOCK_STOPPED);
        assert.equal(guide.need, g.NOTHING_LEFT);
      }
    }
});

test("the clock line always names who the clock runs against now", () => {
  for (const [name, make] of Object.entries(STATES))
    for (const role of ROLES) {
      const i = make(role);
      const guide = g.commissionGuide(i);
      if (i.status === "active") {
        const holder = i.clock.holder;
        const words = role === holder ? /runs against you/ : new RegExp(`runs against the ${holder}`);
        assert.match(guide.clock, words, `${name} / ${role}: ${guide.clock}`);
      } else if (i.status === "requested") assert.equal(guide.clock, g.NO_CLOCK);
    }
});

test("a settlement is offered exactly when the contract would open it, and its countdown is the contract's", () => {
  const open = g.commissionGuide(STATES["maker's move, cancel open"]("client"));
  assert.equal(open.id, "maker-move-cancel-open");
  assert.equal(open.tone, "ready");
  assert.match(open.need, /cancel now and have the whole fee back/);
  assert.match(g.commissionGuide(STATES["maker's move, cancel open after a delivery"]("client")).need, /settles as accepted at the cap/);
  const tooNew = STATES["maker's move, cut at the cap but its turn too new"]("client");
  const waiting = g.commissionGuide(tooNew);
  assert.notEqual(waiting.id, "maker-move-cancel-open", "a turn just handed over is never cancelled in the same breath");
  assert.equal(waiting.left, cancelOpensIn(tooNew.clock, NOW));
  const silence = g.commissionGuide(STATES["client's move, silence open"]("maker"));
  assert.equal(silence.id, "client-move-silence-open");
  assert.match(silence.need, /kill fee of 25%/);
  assert.match(g.commissionGuide(STATES["client's move, silence open after a delivery"]("maker")).need, /settles as if accepted/);
  const over = STATES["client's move, over its allowance"]("maker");
  assert.equal(g.commissionGuide(over).left, silenceOpensIn(over.clock, NOW));
  const grace = g.commissionGuide(STATES["client's move, in its grace"]("client"));
  assert.match(grace.time, /not charged: 4 min 40 s to go/);
  const expired = g.commissionGuide(STATES["requested, too late to accept"]("client"));
  assert.match(expired.need, /Withdraw it: the whole fee comes back/);
  assert.match(g.commissionGuide(STATES["requested, demo"]("client")).need, /Ask the demo maker to accept/);
});

const FNS = ["open_studio", "close_studio", "reopen_studio", "request_commission", "withdraw_request", "decline", "accept", "say", "deliver", "take_move", "accept_work", "claim_silence", "cancel_late"];

test("a wallet prompt for every call, in the demo build and on chain, says where the money is before anything moves", () => {
  for (const fn of FNS)
    for (const mock of [false, true])
      for (const role of ROLES) {
        const guide = g.signGuide({ fn, label: "Doing it", feeAtto: FEE, toMakerAtto: "1", toClientAtto: "2", holder: "maker", role, mock });
        lines(guide, `sign ${fn} ${mock ? "mock" : "chain"} ${role}`);
        assert.equal(guide.canLeave, false, "nobody leaves while the wallet asks");
      }
});

test("a transaction on its way, for every call the validators do not judge", () => {
  for (const fn of FNS.filter((f) => f !== "say" && f !== "deliver"))
    for (const role of ROLES) lines(g.sendingGuide({ fn, target: "C7", title: "Fernhill", feeAtto: FEE, toMakerAtto: "1", toClientAtto: "2", holder: "client", role }), `sending ${fn} ${role}`);
});

test("the validators judging a press or reading a page, on time and late; a note; the demo maker; a final transaction", () => {
  for (const role of ROLES)
    for (const presser of ["maker", "client"])
      for (const stage of ["busy", "late"]) {
        const guide = g.judgeGuide({ role, commission: "C7", presser, feeAtto: FEE, stage });
        lines(guide, `judge ${role} ${presser} ${stage}`);
        assert.match(guide.clock, /first 5 minutes not charged/);
        assert.match(guide.money, /No GEN moves with a message/);
        lines(g.noteGuide({ role, commission: "C7", sender: presser, holder: presser === "maker" ? "client" : "maker", feeAtto: FEE }), `note ${role} ${presser}`);
      }
  for (const role of ROLES)
    for (const holder of ["maker", "client"])
      for (const stage of ["busy", "late"]) {
        const guide = g.readGuide({ role, commission: "C7", page: "mug-final.html", feeAtto: FEE, holder, stage });
        lines(guide, `read ${role} ${holder} ${stage}`);
        assert.match(guide.now, /mug-final\.html/);
      }
  lines(g.demoGuide({ state: "asking", what: "Deliver the finished description", commission: "C7", holder: "maker", feeAtto: FEE }), "demo asking");
  lines(g.demoGuide({ state: "failed", what: "x", commission: "C7", holder: "maker", feeAtto: FEE, reason: "The demo maker is away." }), "demo failed");
  lines(g.updatingGuide("Showing the verdict"), "updating");
});
