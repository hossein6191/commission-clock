// Stages and the bonded appeal (contract version 2), against contracts/commission_clock.py itself where
// the contract has a pure helper: the reading of open_studio's ninth argument, the side a verdict went
// against and who holds the move after it. Then the site's own arithmetic: the shares of a fee, what
// each settlement pays on what is still held (on one stage exactly the one-stage split), the appeal
// window and its countdown, why an appeal is refused before anything is signed, and the waits a
// settlement and a second delivery make while the other side may still appeal.

import test from "node:test";
import assert from "node:assert/strict";

import { acceptSplit, cancelSplit, silenceSplit } from "../../lib/clock.ts";
import { appealCheck, appealLeft, appealTarget, appellantOf, authorOf, holderAfter, openAppeal, redeliverWaitsUntil, settleWaitsUntil } from "../../lib/appeal.ts";
import { DEMO_STAGES } from "../../lib/demo-studio.ts";
import { APPEAL_BOND, APPEAL_WINDOW, BPS, stagesOf } from "../../lib/rules.ts";
import { STAGE_SETS, previewStages, settleSplits, stageShares, stagesArg, stageWord } from "../../lib/stages.ts";
import { askContract } from "./oracle.mjs";

const ATTO = 10n ** 18n;

test("the stages argument is read exactly as the contract reads it", (t) => {
  const raws = [
    "",
    DEMO_STAGES,
    "Outline=2000|Final=8000",
    "Draft=5000=the whole piece|Final=5000",
    "A=5000|Final=5000",
    "Outline=2000|Final=7000",
    "Outline=99|Final=9901",
    "Outline=10000",
    "a=1000|b=1000|c=1000|d=7000",
    "One=2500|Two=2500|Three=2500|Four=2000|Five=500",
    "Outline=20%|Final=80%",
    "Outline|Final=10000",
    "Outline=2000=x=y|Final=8000",
    " Outline = 2000 = a list |Final=8000",
    "Outline=02000|Final=8000",
    "Outline=+2000|Final=8000",
    "x".repeat(41) + "=10000",
    "Name=10000=" + "y".repeat(201),
    "Café=10000",
    "z".repeat(1000),
    ...STAGE_SETS.map((s) => stagesArg(s.rows)),
  ];
  const answers = askContract(raws.map((r) => ({ fn: "_stages_of", args: [r] })));
  if (!answers) return t.skip("no python3 on this machine");
  raws.forEach((r, i) => assert.deepEqual(stagesOf(r), answers[i].ok, JSON.stringify(r)));
});

test("the side a verdict went against, and who holds the move after it, are the contract's", (t) => {
  const cases = [];
  for (const role of ["maker", "client"])
    for (const v of ["pass", "keep", "unclear"]) for (const before of ["maker", "client"]) cases.push(["say", v, role, before]);
  for (const v of ["delivered", "missing", "unclear"]) for (const before of ["maker", "client"]) cases.push(["deliver", v, "maker", before]);
  const answers = askContract([...cases.map((c) => ({ fn: "_appellant", args: c.slice(0, 3) })), ...cases.map((c) => ({ fn: "_holder_after", args: c }))]);
  if (!answers) return t.skip("no python3 on this machine");
  cases.forEach((c, i) => {
    assert.equal(appellantOf(c[0], c[1], c[2]), answers[i].ok, `_appellant ${c.join(" ")}`);
    assert.equal(holderAfter(c[0], c[1], c[2], c[3]), answers[cases.length + i].ok, `_holder_after ${c.join(" ")}`);
  });
});

test("the shares of a fee add up to the fee, the last stage taking the odd atto", () => {
  for (const fee of [1n, 7n, ATTO / 2n, 3n * ATTO + 1n, 100n * ATTO]) {
    for (const bps of [[10000], [2000, 3000, 5000], [3333, 3333, 3334], [100, 100, 100, 9700]]) {
      const shares = stageShares(fee, bps);
      assert.equal(shares.reduce((a, b) => a + b, 0n), fee);
      shares.slice(0, -1).forEach((s, i) => assert.equal(s, (fee * BigInt(bps[i])) / BigInt(BPS)));
    }
  }
  const p = previewStages([{ name: "Outline", bps: 2000, about: "" }, { name: "Final", bps: 7000, about: "" }], ATTO);
  assert.match(p.problem, /add up to 10000 basis points; these add up to 9000/);
  assert.equal(p.total, 9000);
  const q = previewStages([], ATTO);
  assert.deepEqual([q.arg, q.problem, q.stages.length, q.shares], ["", "", 1, [ATTO]], "no rows is one stage, the whole fee");
  assert.equal(stageWord({ status: "current", deliveredBy: 3 }), "delivered, waiting for the client");
  assert.equal(stageWord({ status: "accepted", deliveredBy: 3 }), "accepted and paid");
});

const clockAt = (makerUsed, clientUsed) => ({ holder: "client", since: 0, handedBy: 0, makerUsed, clientUsed, makerSeconds: 1200, clientSeconds: 600, stepSeconds: 120, cutBps: 1000, maxCutBps: 5000 });

test("on one stage every settlement pays exactly what the one-stage contract paid", () => {
  const fee = ATTO / 2n;
  for (const [mu, cu] of [[0, 0], [1200, 0], [1300, 700], [2000, 50], [9999, 9999]]) {
    const c = clockAt(mu, cu);
    for (const delivered of [true, false]) {
      const s = settleSplits(c, fee, fee, delivered, true, 0);
      const pair = (x) => ({ toMaker: x.toMaker, toClient: x.toClient });
      assert.deepEqual(s.accept, pair(acceptSplit(c, fee, 0)));
      assert.deepEqual(s.silence, pair(silenceSplit(c, fee, delivered ? 1 : 0, 0)));
      assert.deepEqual(s.cancel, pair(cancelSplit(c, fee, delivered ? 1 : 0, 0)));
    }
  }
});

test("a stage before the last is paid on its own share, its cut taken from that share alone", () => {
  const fee = ATTO / 2n;
  const [outline, draft] = stageShares(fee, [2000, 3000, 5000]);
  const late = clockAt(1200 + 121, 0); // two started steps late: 20%
  const s = settleSplits(late, fee, outline, true, false, 0);
  assert.equal(s.total, 2000);
  assert.deepEqual(s.accept, { toMaker: (outline * 8n) / 10n, toClient: (outline * 2n) / 10n });
  // claim_silence with a delivery standing: the stage as accepted, plus the kill fee (25%, never more than 100% - cut) on what is held after it
  const held = fee - outline;
  const t = settleSplits(late, held, draft, true, false, 0);
  assert.equal(t.silence.toMaker, draft - (draft * 2n) / 10n + ((held - draft) * 2500n) / 10000n);
  assert.equal(t.silence.toMaker + t.silence.toClient, held, "only what is still held is settled");
  assert.equal(t.cancel.toMaker, draft - (draft * 2n) / 10n);
  assert.deepEqual(settleSplits(late, held, draft, false, false, 0).cancel, { toMaker: 0n, toClient: held }, "without a delivery for the stage it all goes back");
});

const verdict = (over) => ({ message: "C4#3", n: 3, kind: "say", verdict: "pass", was: "", appellant: "client", deadline: 1000 + APPEAL_WINDOW, appeal: "", appealRole: "", open: true, ...over });

test("a verdict is appealable by the side it went against, once, until its deadline", () => {
  const v = verdict();
  assert.equal(openAppeal(v, 1000, "active"), "client");
  assert.equal(openAppeal(v, 1000 + APPEAL_WINDOW, "active"), "client", "the deadline second is still inside");
  assert.equal(openAppeal(v, 1001 + APPEAL_WINDOW, "active"), "");
  assert.equal(openAppeal(v, 1000, "accepted"), "", "only while the commission is active");
  assert.equal(openAppeal(verdict({ appeal: "keep", appealRole: "client" }), 1000, "active"), "", "an appeal is final");
  assert.equal(appealLeft(v, 1100), APPEAL_WINDOW - 100);
  assert.equal(appealLeft(v, 99999), 0);
  assert.equal(authorOf(v), "maker", "a pass went against the side that now holds the move: the maker wrote it");
  assert.equal(authorOf(verdict({ verdict: "keep", appellant: "maker" })), "maker");
  const d = verdict({ message: "C4#5", n: 5, kind: "deliver", verdict: "missing", appellant: "maker" });
  assert.equal(appealTarget(verdict({ appellant: "maker", verdict: "keep" }), d, "maker", 1000, "active").n, 5, "the later of the two when both went against the caller");
});

test("an appeal is refused before signing, in the order the contract checks, and says why", () => {
  const base = { status: "active", id: "C4", press: verdict(), delivery: null, now: 1000, credit: APPEAL_BOND };
  assert.match(appealCheck({ ...base, role: "visitor" }).why, /Only the maker or the client/);
  assert.match(appealCheck({ ...base, role: "client", status: "accepted" }).why, /is accepted/);
  assert.match(appealCheck({ ...base, role: "maker" }).why, /went your way/);
  assert.match(appealCheck({ ...base, role: "client", credit: APPEAL_BOND - 1n }).why, /deposit first/);
  assert.match(appealCheck({ ...base, role: "client", press: verdict({ appeal: "pass", appealRole: "client" }) }).why, /appealed once already/);
  assert.match(appealCheck({ ...base, role: "client", now: 5000 }).why, /within 10 minutes/);
  const ok = appealCheck({ ...base, role: "client" });
  assert.equal(ok.ok, true);
  assert.equal(ok.target.message, "C4#3");
});

test("a settlement and a second delivery wait while the other side may still appeal", () => {
  // the client's pass handed the move to the maker; the maker may appeal it, so the client may not cancel on it yet
  const press = verdict({ appellant: "maker", verdict: "pass" });
  assert.equal(settleWaitsUntil(press, null, "client", 1000, "active"), press.deadline);
  assert.equal(settleWaitsUntil(press, null, "maker", 1000, "active"), 0, "the appellant itself waits for nothing");
  assert.equal(settleWaitsUntil(press, null, "client", press.deadline + 1, "active"), 0);
  const delivery = verdict({ message: "C4#5", n: 5, kind: "deliver", verdict: "delivered", appellant: "client" });
  assert.equal(redeliverWaitsUntil(delivery, 2, 2, false, 1000, "active"), delivery.deadline);
  assert.equal(redeliverWaitsUntil(delivery, 2, 2, true, 1000, "active"), 0, "once the client wrote, the maker may deliver");
  assert.equal(redeliverWaitsUntil(delivery, 1, 2, false, 1000, "active"), 0, "a page for an earlier stage does not block");
});
