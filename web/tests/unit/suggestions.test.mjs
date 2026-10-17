// Every one-click suggestion is inside the contract's limits, so no chip ever fills a field with
// something the contract would refuse; every message chip of every demo job carries the verdict the
// demo build gives it on that job's brief, so a visitor who presses one sees what the chip promised;
// and the brief chips are the four demo jobs, the mug first.

import test from "node:test";
import assert from "node:assert/strict";

import * as s from "../../lib/suggestions.ts";
import { DEMO_BRIEF, DEMO_JOBS, DEMO_STUDIO_NAME, DEMO_TERMS, LATER, scriptedPress } from "../../lib/demo-studio.ts";
import { aboutProblem, briefProblem, deliveryProblem, messageProblem, nameProblem, termsOfProblem } from "../../lib/rules.ts";

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

test("the brief chips are the four demo jobs, the mug first, each marked as one the demo maker plays", () => {
  assert.deepEqual(
    s.BRIEF_CHIPS.map((b) => b.value),
    DEMO_JOBS.map((j) => j.brief),
  );
  assert.equal(s.BRIEF_CHIPS.length, 4);
  assert.equal(s.BRIEF_CHIPS[0].value, DEMO_BRIEF, "the mug first");
  for (const b of s.BRIEF_CHIPS) {
    assert.equal(briefProblem(b.value), "", b.label);
    assert.match(b.label, / \(demo drafts\)$/, b.label);
  }
  assert.deepEqual(
    s.BRIEF_CHIPS.map((b) => b.label),
    ["The stoneware mug (demo drafts)", "A bakery's welcome email (demo drafts)", "A cafe's chalkboard menu (demo drafts)", "A bike shop's About us (demo drafts)"],
  );
});

test("every job's message chips are one line of printable ASCII, and each promises the verdict the demo build gives on that job's brief", () => {
  assert.deepEqual(Object.keys(s.JOB_CHIPS), DEMO_JOBS.map((j) => j.key));
  for (const j of DEMO_JOBS) {
    const c = s.JOB_CHIPS[j.key];
    // By kind: concrete answers pass and "I'll get back to you" keeps; a revision passes, praise keeps, a vague request is unclear.
    assert.ok(c.answers.length >= 2, j.key);
    assert.deepEqual(c.answers.map((x) => x.expect), [...c.answers.slice(0, -1).map(() => "pass"), "keep"], `${j.key} answers`);
    assert.equal(c.answers.at(-1).text, LATER);
    assert.deepEqual(c.reviews.map((x) => x.expect), ["pass", "keep", "unclear"], `${j.key} reviews`);
    assert.deepEqual(c.notes.map((x) => x.expect), ["noted", "noted"], `${j.key} notes`);
    assert.deepEqual(c.maker.map((x) => x.expect), ["pass", "keep", "keep"], `${j.key} maker`);
    assert.deepEqual(c.maker.map((x) => x.text), j.actions.filter((a) => a.kind === "say").map((a) => a.text), `${j.key}: the maker's chips are its script's messages`);
    for (const x of [...c.answers, ...c.reviews, ...c.notes, ...c.maker]) {
      assert.equal(messageProblem(x.text), "", `${j.key} ${x.label}`);
      if (x.expect !== "noted") assert.equal(scriptedPress(x.text, j.brief), x.expect, `${j.key} ${x.label}: ${x.text}`);
      assert.ok(x.note.length > 10 && x.label.length > 1, `${j.key} ${x.label}`);
    }
    // Every client line the job knows is offered as a chip.
    assert.deepEqual(new Set([...c.answers, ...c.reviews].map((x) => x.text)), new Set(j.lines.map((l) => l.text)), `${j.key}: every line is a chip`);
    // The chips a composer offers fit who writes, where the move is, and the commission's brief.
    assert.deepEqual(s.messageChipsFor("client", "maker", 0, j.brief), c.notes);
    assert.equal(s.messageChipsFor("client", "client", 1, j.brief)[0], c.reviews[0], "after a delivery the review lines come first");
    assert.equal(s.messageChipsFor("client", "client", 0, j.brief)[0], c.answers[0], "before one the answers come first");
    assert.deepEqual(s.messageChipsFor("maker", "maker", 0, j.brief), c.maker);
    assert.deepEqual(s.messageChipsFor("maker", "client", 0, j.brief), [s.MAKER_NOTE_CHIP]);
    assert.equal(s.chipsFor(j.brief), c);
  }
  assert.equal(messageProblem(s.MAKER_NOTE_CHIP.text), "");
  // Any other brief gets the mug's chips, as before there were four jobs.
  assert.equal(s.chipsFor("Wording for a wedding invitation: two names, a date in June, a garden venue."), s.JOB_CHIPS.mug);
  assert.deepEqual(s.messageChipsFor("client", "client", 0), [...s.JOB_CHIPS.mug.answers, ...s.JOB_CHIPS.mug.reviews]);
});

test("every delivery note chip of every job is a note the contract takes", () => {
  for (const j of DEMO_JOBS) {
    const notes = s.JOB_CHIPS[j.key].deliveryNotes;
    assert.ok(notes.includes(""), "no note at all is one of them");
    for (const n of notes) assert.equal(deliveryProblem(`https://raw.githubusercontent.com/a/b/0123456789abcdef0123456789abcdef01234567/drafts/${j.drafts[3].file}`, n), "", JSON.stringify(n));
  }
});
