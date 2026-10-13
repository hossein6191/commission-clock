// Every one-click suggestion is inside the contract's limits, so no chip ever fills a field with
// something the contract would refuse; and every message chip carries the verdict the demo build
// gives it, so a visitor who presses one sees what the chip promised.

import test from "node:test";
import assert from "node:assert/strict";

import * as s from "../../lib/suggestions.ts";
import { DEMO_ACTIONS, DEMO_BRIEF, DEMO_STUDIO_NAME, DEMO_TERMS, scriptedPress } from "../../lib/demo-studio.ts";
import { aboutProblem, briefProblem, deliveryProblem, messageProblem, nameProblem, termsOfProblem, textProblem, MAX_NOTE } from "../../lib/rules.ts";

test("studio names and about lines are inside the limits, and none is the demo studio's name", () => {
  for (const n of s.NAME_CHIPS) {
    assert.equal(nameProblem(n), "", n);
    assert.notEqual(n, DEMO_STUDIO_NAME);
  }
  assert.equal(new Set(s.NAME_CHIPS).size, s.NAME_CHIPS.length);
  for (const a of s.ABOUT_CHIPS) assert.equal(aboutProblem(a), "", a);
});

test("every set of terms, and every single term, opens a studio the contract accepts", () => {
  for (const t of s.TERMS_CHIPS) assert.equal(termsOfProblem(t), "", t.label);
  assert.ok(s.TERMS_CHIPS.some((t) => t.makerSeconds === DEMO_TERMS.makerSeconds && t.feeAtto === DEMO_TERMS.feeAtto), "the demo clock is one of them");
  const base = s.TERMS_CHIPS[1];
  for (const c of s.FEE_CHIPS) assert.equal(termsOfProblem({ ...base, feeAtto: c.value }), "", c.label);
  for (const c of s.MAKER_SECONDS_CHIPS) assert.equal(termsOfProblem({ ...base, makerSeconds: c.value }), "", c.label);
  for (const c of s.CLIENT_SECONDS_CHIPS) assert.equal(termsOfProblem({ ...base, clientSeconds: c.value }), "", c.label);
  for (const c of s.STEP_CHIPS) assert.equal(termsOfProblem({ ...base, stepSeconds: c.value, cutBps: 1000, maxCutBps: 5000 }), "", c.label);
  for (const c of s.CUT_CHIPS) assert.equal(termsOfProblem({ ...base, cutBps: c.value }), "", c.label);
  for (const c of s.CAP_CHIPS) assert.equal(termsOfProblem({ ...base, maxCutBps: c.value }), "", c.label);
});

test("every brief chip is a brief the contract takes, and the first is the one the demo drafts answer", () => {
  for (const b of s.BRIEF_CHIPS) assert.equal(briefProblem(b.value), "", b.label);
  assert.equal(s.BRIEF_CHIPS[0].value, DEMO_BRIEF);
});

test("every message chip is one line of printable ASCII, and its promised verdict is the one the demo build gives", () => {
  const all = [...s.CLIENT_ANSWER_CHIPS, ...s.CLIENT_REVIEW_CHIPS, ...s.CLIENT_NOTE_CHIPS, ...s.MAKER_PRESS_CHIPS];
  for (const c of all) {
    assert.equal(messageProblem(c.text), "", c.label);
    if (c.expect !== "noted") assert.equal(scriptedPress(c.text), c.expect, `${c.label}: ${c.text}`);
    assert.ok(c.note.length > 10);
  }
  for (const a of DEMO_ACTIONS) assert.equal(textProblem(a.text, a.kind === "say" ? 1 : 0, a.kind === "say" ? 600 : MAX_NOTE, "x"), "", a.key);
  // The chips a composer offers fit who writes and where the move is.
  assert.deepEqual(s.messageChipsFor("client", "maker", 0), s.CLIENT_NOTE_CHIPS);
  assert.equal(s.messageChipsFor("client", "client", 1)[0], s.CLIENT_REVIEW_CHIPS[0], "after a delivery the review lines come first");
  assert.equal(s.messageChipsFor("client", "client", 0)[0], s.CLIENT_ANSWER_CHIPS[0], "before one the answers come first");
  assert.deepEqual(s.messageChipsFor("maker", "maker", 0), s.MAKER_PRESS_CHIPS);
  assert.equal(s.messageChipsFor("maker", "client", 0)[0].expect, "noted");
  for (const c of [...s.messageChipsFor("maker", "client", 0)]) assert.equal(messageProblem(c.text), "");
});

test("every delivery note chip is a note the contract takes", () => {
  for (const n of s.NOTE_CHIPS) assert.equal(deliveryProblem("https://raw.githubusercontent.com/a/b/0123456789abcdef0123456789abcdef01234567/drafts/mug-final.html", n), "", JSON.stringify(n));
});
