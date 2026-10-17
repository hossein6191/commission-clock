// Seeded random journeys through the in-memory contract: anyone does anything, in any order, with
// right and wrong fees, real and made-up pages, and the clock jumps. After every step no atto is
// created or lost; the contract's balance is exactly the fees of the commissions requested or active;
// every settled commission paid out its whole fee and never changes again; used seconds only grow and
// `since` never moves back; and the totals stats() publishes add up.

import test from "node:test";
import assert from "node:assert/strict";

import * as mock from "../../lib/chain-mock.ts";
import { calls } from "../../lib/calls.ts";
import { ACTION_KEYS, DEMO_BRIEF, DEMO_JOBS } from "../../lib/demo-studio.ts";
import { BRIEF_CHIPS } from "../../lib/suggestions.ts";

/** A brief that is no demo job's: the demo maker refuses every move on it. */
const OFF_SCRIPT = "Wording for a wedding invitation: two names, a date in June, a garden venue, and an RSVP line. Warm, not formal.";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const view = async (fn, args) => JSON.parse(await mock.view(fn, args));

async function finalOf(hash) {
  for (let i = 0; i < 40; i++) {
    const s = await mock.txStatus(hash);
    if (s.status === "FINALIZED" || s.status === "UNDETERMINED") return s;
  }
  throw new Error("never final");
}

const seen = new Map();

async function check(total, step) {
  let sum = mock.mockContractBalance();
  for (const a of mock.ACCOUNTS) sum += await mock.balanceOf(a);
  assert.equal(sum, total, `${step}: no atto created or lost`);
  const { held, balance } = mock.mockHeld();
  assert.equal(held, balance, `${step}: the contract holds exactly the open fees`);
  const st = await view("stats", []);
  let open = 0n;
  for (let k = 1; k <= st.commissions; k++) {
    const c = await view("commission", ["C" + k]);
    const live = c.status === "requested" || c.status === "active";
    if (live) {
      assert.equal(c.held, c.fee, `${step}: open C${k} holds its whole fee`);
      open += BigInt(c.held);
    } else {
      assert.equal(c.held, "0", `${step}: settled C${k} holds nothing`);
      assert.equal(BigInt(c.maker_paid) + BigInt(c.client_paid), BigInt(c.fee), `${step}: settled C${k} paid out its whole fee`);
      assert.equal(c.holder, "", `${step}: settled C${k}'s clock is stopped`);
    }
    assert.ok(c.maker_live >= c.maker_used && c.client_live >= c.client_used, `${step}: C${k}'s live uses are at least its used seconds`);
    const prev = seen.get(c.commission);
    if (prev) {
      assert.ok(c.maker_used >= prev.maker_used && c.client_used >= prev.client_used, `${step}: C${k}'s used seconds only grow`);
      assert.ok(c.since >= prev.since || c.since === 0, `${step}: C${k}'s since never moves back`);
      if (prev.status !== "requested" && prev.status !== "active") assert.deepEqual(c, { ...prev, now: c.now, maker_live: c.maker_live, client_live: c.client_live }, `${step}: settled C${k} never changes`);
      if (c.status === "accepted" || c.status === "accepted_by_silence") assert.ok(c.deliveries > 0, `${step}: C${k} was accepted with a delivery`);
    }
    seen.set(c.commission, c);
  }
  assert.equal(BigInt(st.held), open, `${step}: stats().held is every open fee`);
  assert.equal(BigInt(st.held), BigInt(st.taken) - BigInt(st.to_makers) - BigInt(st.to_clients), `${step}: held = taken - paid out`);
  assert.equal(st.waiting + st.active + st.accepted + st.accepted_by_silence + st.lapsed + st.cancelled_late + st.withdrawn + st.declined, st.commissions, `${step}: every commission is counted once`);
  assert.equal(st.presses, st.passed + st.kept + st.unclear, `${step}: every press has one verdict`);
  assert.equal(st.deliveries, st.delivered + st.missing + st.delivery_unclear, `${step}: every page read has one verdict`);
}

test("300 seeded random steps by anyone, in any order: the money and the clock stay whole", async () => {
  const r = rng(20261013);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  for (const a of mock.ACCOUNTS) await mock.faucet(a);
  const total = await (async () => {
    let s = mock.mockContractBalance();
    for (const a of mock.ACCOUNTS) s += await mock.balanceOf(a);
    return s;
  })();
  await check(total, "seeded");
  const texts = [...DEMO_JOBS.flatMap((j) => j.lines.map((l) => l.text)), "Should the description be written in English?", "Working on it, nearly there.", "ok", "two\nlines"];
  const pages = [mock.mockDraft("final"), mock.mockDraft("placeholder"), mock.mockDraft("revised"), mock.mockDraft("final", "cafe"), "https://nowhere.example/x.html", "http://bad.example/x"];
  for (let step = 0; step < 300; step++) {
    const st = await view("stats", []);
    const open = [...seen.values()].filter((c) => c.status === "requested" || c.status === "active").map((c) => c.commission);
    const cid = open.length && r() < 0.75 ? pick(open) : "C" + (1 + Math.floor(r() * (st.commissions + 1)));
    const who = pick(mock.ACCOUNTS);
    const roll = r();
    let label = "";
    if (roll < 0.1) {
      mock.advanceClock(pick([30, 120, 301, 700, 1800, 4000]));
      label = "clock";
    } else if (roll < 0.3) {
      const studio = pick(["S1", "S1", "S2", "S9"]);
      const fee = studio === "S1" ? pick([10n ** 18n / 2n, 10n ** 18n / 2n, 1n]) : pick([10n ** 18n, 10n ** 18n, 1n]);
      mock.setMockPersona(who);
      await finalOf(await mock.write(calls.requestCommission(studio, pick([DEMO_BRIEF, DEMO_BRIEF, BRIEF_CHIPS[1].value, BRIEF_CHIPS[2].value, BRIEF_CHIPS[3].value, OFF_SCRIPT, "short"]), fee)));
      label = `request ${studio}`;
    } else if (roll < 0.45) {
      const a = r() < 0.3 ? await mock.demoAccept(cid) : await mock.demoAct(cid, pick(ACTION_KEYS));
      if (a.ok) await finalOf(a.hash);
      label = `demo on ${cid}`;
    } else {
      const call = pick([
        () => calls.withdrawRequest(cid),
        () => calls.decline(cid),
        () => calls.accept(cid),
        () => calls.say(cid, pick(texts)),
        () => calls.say(cid, pick(texts)),
        () => calls.deliver(cid, pick(pages), "note"),
        () => calls.takeMove(cid),
        () => calls.acceptWork(cid),
        () => calls.claimSilence(cid),
        () => calls.cancelLate(cid),
        () => calls.closeStudio("S2"),
        () => calls.reopenStudio("S2"),
      ])();
      // Most calls on a commission come from one of its two parties, so they get past the door.
      const row = seen.get(cid);
      const sender = row && r() < 0.7 ? pick([row.client, row.maker]) : who;
      mock.setMockPersona(sender);
      await finalOf(await mock.write(call));
      label = `${call.fn} ${cid}`;
    }
    await check(total, `step ${step} (${label})`);
  }
  const st = await view("stats", []);
  assert.ok(st.commissions > 15, `the journey made commissions (${st.commissions})`);
  assert.ok(st.presses > 10 && st.deliveries > 10, `and pressed (${st.presses}) and delivered (${st.deliveries})`);
  const ended = ["accepted", "accepted_by_silence", "lapsed", "cancelled_late", "withdrawn", "declined"].filter((k) => st[k] > 0);
  assert.ok(ended.length >= 5, `and settled in many ways: ${ended.join(", ")}`);
});
