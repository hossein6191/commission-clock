// The live clock arithmetic every face ticks with (lib/clock.ts), against contracts/commission_clock.py
// itself: on seeded random clock states and instants, the grace, the charged seconds, each side's live
// use, the seconds until a settlement opens, the late terms, the cap point and the move to another
// side give exactly what the contract's own helpers give. Then the faces' text.

import test from "node:test";
import assert from "node:assert/strict";

import * as clock from "../../lib/clock.ts";
import { stepsToCap } from "../../lib/rules.ts";
import { askContract } from "./oracle.mjs";

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

function states(n, seed) {
  const r = rng(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const out = [];
  for (let i = 0; i < n; i++) {
    const cut = int(1, 2500);
    const cap = Math.max(cut, int(100, 9000));
    const since = int(1_700_000_000, 1_700_100_000);
    out.push({
      state: {
        holder: ["maker", "client", ""][int(0, 2)],
        since,
        handedBy: r() < 0.5 ? 0 : int(1, 40),
        makerUsed: int(0, 5000),
        clientUsed: int(0, 3000),
        makerSeconds: int(600, 4000),
        clientSeconds: int(300, 2000),
        stepSeconds: int(60, 600),
        cutBps: cut,
        maxCutBps: cap,
        fee: String(BigInt(int(1, 1000)) * 10n ** 15n + BigInt(int(0, 999))),
      },
      now: since + int(-400, 6000),
    });
  }
  return out;
}

test("the clock arithmetic is the contract's, on 300 random states", (t) => {
  const cases = states(300, 7);
  const asks = [];
  for (const { state, now } of cases) {
    asks.push({ fn: "_grace", args: [state] });
    asks.push({ fn: "_charged", args: [state, now] });
    asks.push({ fn: "_live", args: [state, "maker", now] });
    asks.push({ fn: "_live", args: [state, "client", now] });
    asks.push({ fn: "_opens_in", args: [state, now, Math.max(300, state.clientSeconds + 1 - state.clientUsed)] });
    asks.push({ fn: "_opens_in", args: [state, now, Math.max(300, 0)] });
    asks.push({ fn: "_late_terms", args: [state, now] });
    asks.push({ fn: "_cap_after", args: [state] });
    asks.push({ fn: "_move_to", args: [state, ["maker", "client", ""][now % 3], now, now % 2 ? 7 : 0] });
    asks.push({ fn: "_cut_of", args: [state.fee, clock.lateTerms(state, now).total] });
  }
  const answers = askContract(asks);
  if (!answers) return t.skip("no python3 on this machine");
  let k = 0;
  for (const { state, now } of cases) {
    const tag = JSON.stringify({ state, now });
    assert.equal(clock.grace(state), answers[k++].ok, "grace " + tag);
    assert.equal(clock.charged(state, now), answers[k++].ok, "charged " + tag);
    assert.equal(clock.live(state, "maker", now), answers[k++].ok, "maker live " + tag);
    assert.equal(clock.live(state, "client", now), answers[k++].ok, "client live " + tag);
    assert.equal(clock.silenceOpensIn(state, now), answers[k++].ok, "silence opens " + tag);
    assert.equal(clock.opensIn(state, now, 300), answers[k++].ok, "opens in " + tag);
    const lt = clock.lateTerms(state, now);
    assert.deepEqual([lt.late, lt.total], answers[k++].ok, "late terms " + tag);
    assert.equal(clock.capAfter(state), answers[k++].ok, "cap after " + tag);
    const moved = { ...state };
    clock.moveTo(moved, ["maker", "client", ""][now % 3], now, now % 2 ? 7 : 0);
    const theirs = answers[k++].ok;
    assert.deepEqual({ holder: moved.holder, since: moved.since, handedBy: moved.handedBy, makerUsed: moved.makerUsed, clientUsed: moved.clientUsed }, theirs, "move " + tag);
    assert.equal(clock.cutOf(BigInt(state.fee), lt.total).toString(), answers[k++].ok, "cut of " + tag);
  }
});

test("the cut per started step, its cap and the steps to the cap are the contract's", (t) => {
  const asks = [];
  const cases = [];
  for (const late of [0, 1, 59, 60, 61, 119, 120, 121, 599, 600, 601, 10_000])
    for (const [step, cut, cap] of [
      [60, 1000, 5000],
      [120, 1000, 5000],
      [3600, 500, 4000],
      [86400, 1, 9000],
      [60, 2500, 2500],
    ]) {
      cases.push([late, step, cut, cap]);
      asks.push({ fn: "_cut_bps_for", args: [late, step, cut, cap] });
      asks.push({ fn: "_steps_to_cap", args: [cut, cap] });
    }
  const answers = askContract(asks);
  if (!answers) return t.skip("no python3 on this machine");
  let k = 0;
  for (const [late, step, cut, cap] of cases) {
    assert.equal(clock.cutBpsFor(late, step, cut, cap), answers[k++].ok, `cut ${late}/${step}/${cut}/${cap}`);
    assert.equal(stepsToCap(cut, cap), answers[k++].ok, `steps ${cut}/${cap}`);
  }
});

test("the settlement splits always pay out the whole fee, and never more than it", () => {
  for (const { state, now } of states(400, 11)) {
    const fee = BigInt(state.fee);
    for (const deliveries of [0, 1]) {
      for (const s of [clock.acceptSplit(state, fee, now), clock.silenceSplit(state, fee, deliveries, now), clock.cancelSplit(state, fee, deliveries, now)]) {
        assert.equal(s.toMaker + s.toClient, fee);
        assert.ok(s.toMaker >= 0n && s.toClient >= 0n);
      }
      // The kill fee is never more than the fee less the late cut.
      const kill = clock.silenceSplit(state, fee, 0, now);
      assert.ok(kill.toMaker <= fee - clock.cutOf(fee, kill.total));
    }
    // With nothing delivered a late cancel sends the whole fee back.
    assert.equal(clock.cancelSplit(state, fee, 0, now).toClient, fee);
  }
});

test("the live face ticks: the holder's seconds grow by one a second once its grace is over, the other side's stay", () => {
  const c = { holder: "maker", since: 1000, handedBy: 3, makerUsed: 100, clientUsed: 50, makerSeconds: 1200, clientSeconds: 600, stepSeconds: 120, cutBps: 1000, maxCutBps: 5000 };
  assert.equal(clock.live(c, "maker", 1000), 100);
  assert.equal(clock.live(c, "maker", 1300), 100, "the first 300 s of a handed-over turn are not charged");
  assert.equal(clock.graceLeft(c, 1100), 200);
  assert.equal(clock.live(c, "maker", 1301), 101);
  assert.equal(clock.live(c, "maker", 1400), 200);
  assert.equal(clock.live(c, "client", 99999), 50);
  const taken = { ...c, handedBy: 0 };
  assert.equal(clock.live(taken, "maker", 1001), 101, "a turn taken by the side itself has no grace");
  assert.equal(clock.skewOf(1500, 1490), 10);
  assert.equal(clock.skewOf(0, 1490), 0);
});

test("the faces print minutes and seconds, negative once over, days for long allowances", () => {
  assert.equal(clock.faceText(1200), "20:00");
  assert.equal(clock.faceText(61), "1:01");
  assert.equal(clock.faceText(0), "0:00");
  assert.equal(clock.faceText(-42), "-0:42");
  assert.equal(clock.faceText(3725), "1:02:05");
  assert.equal(clock.faceText(5 * 86400 + 7200), "5d 2h");
  assert.equal(clock.faceText(-3 * 86400), "-3d 0h");
});
