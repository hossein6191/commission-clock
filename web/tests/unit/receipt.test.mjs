// The stamps on judged messages and the settlement receipt (lib/receipt.ts): every verdict earns its
// stamp, worded for whoever reads it, and every way a commission settles prints where the whole fee
// went.

import test from "node:test";
import assert from "node:assert/strict";

import { ENDINGS, settlementLines, stampOf } from "../../lib/receipt.ts";

test("every verdict earns its stamp", () => {
  const m = (kind, verdict, role = "maker", fp = "3a9c0d1e2f405162") => ({ kind, verdict, role, fp });
  assert.equal(stampOf(m("say", "pass"), "maker").text, "PRESS COUNTED - move to client");
  assert.equal(stampOf(m("say", "pass", "client"), "client").text, "PRESS COUNTED - move to maker");
  assert.equal(stampOf(m("say", "keep"), "maker").text, "PRESS NOT COUNTED - still your move");
  assert.equal(stampOf(m("say", "keep"), "client").text, "PRESS NOT COUNTED - still the maker's move");
  assert.equal(stampOf(m("say", "unclear"), "maker").text, "UNCLEAR - still your move");
  assert.equal(stampOf(m("say", "unclear", "client"), "visitor").text, "UNCLEAR - still the client's move");
  assert.equal(stampOf(m("say", "noted", "client"), "client").text, "NOTED - not a press");
  assert.equal(stampOf(m("deliver", "delivered"), "client").text, "DRAFT READ ON THE WEB - delivered (fp 3a9c…)");
  assert.equal(stampOf(m("deliver", "missing"), "client").text, "DRAFT MISSING");
  assert.equal(stampOf(m("deliver", "unclear"), "client").text, "DRAFT UNCLEAR - not counted");
  assert.equal(stampOf(m("take", "taken", "client"), "maker").text, "TOOK THE MOVE");
  for (const v of ["pass", "keep", "unclear", "noted"]) assert.ok(stampOf(m("say", v), "visitor").meaning.length > 20);
});

test("every settlement prints the fee, the clock as it stopped, and where all of it went", () => {
  const base = { feeAtto: "500000000000000000", makerUsed: 1500, clientUsed: 120, makerSeconds: 1200, clientSeconds: 600, maxCutBps: 5000 };
  const cases = [
    ["accepted", { makerLate: 300, cutBpsTotal: 3000, deliveries: 1, makerPaidAtto: "350000000000000000", clientPaidAtto: "150000000000000000" }],
    ["accepted_by_silence", { makerLate: 0, cutBpsTotal: 0, deliveries: 1, makerPaidAtto: "500000000000000000", clientPaidAtto: "0" }],
    ["lapsed", { makerLate: 0, cutBpsTotal: 0, deliveries: 0, makerPaidAtto: "125000000000000000", clientPaidAtto: "375000000000000000" }],
    ["cancelled_late", { makerLate: 500, cutBpsTotal: 5000, deliveries: 0, makerPaidAtto: "0", clientPaidAtto: "500000000000000000" }],
    ["withdrawn", { makerLate: 0, cutBpsTotal: 0, deliveries: 0, makerPaidAtto: "0", clientPaidAtto: "500000000000000000" }],
    ["declined", { makerLate: 0, cutBpsTotal: 0, deliveries: 0, makerPaidAtto: "0", clientPaidAtto: "500000000000000000" }],
  ];
  for (const [status, o] of cases) {
    const lines = settlementLines({ ...base, status, ...o });
    const get = (label) => lines.find((l) => l.label === label)?.value;
    assert.equal(get("Fee held"), "0.5 GEN", status);
    assert.equal(BigInt(o.makerPaidAtto) + BigInt(o.clientPaidAtto), BigInt(base.feeAtto), status);
    assert.ok(get("To the maker") && get("To the client"), status);
    assert.ok(ENDINGS[status], status);
  }
  const late = settlementLines({ ...base, status: "accepted", ...cases[0][1] });
  assert.equal(late.find((l) => l.label === "Late cut").value, "30% = 0.15 GEN");
  assert.equal(late.find((l) => l.label === "Maker over").value, "5 min");
  assert.equal(settlementLines({ ...base, status: "withdrawn", ...cases[4][1] }).find((l) => l.label === "Clock").value, "never started");
  assert.equal(settlementLines({ ...base, status: "lapsed", ...cases[2][1] }).find((l) => l.label === "Kill fee").value, "25% of the fee");
});
