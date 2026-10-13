// The display helpers (lib/format.ts).

import test from "node:test";
import assert from "node:assert/strict";

import * as f from "../../lib/format.ts";

test("amounts, durations and percentages print as a person says them", () => {
  assert.equal(f.gen("500000000000000000"), "0.5 GEN");
  assert.equal(f.gen(10n ** 18n), "1 GEN");
  assert.equal(f.gen("125000000000000000"), "0.125 GEN");
  assert.equal(f.gen("1"), "<0.0001 GEN");
  assert.equal(f.gen(""), "0 GEN");
  assert.equal(f.toAtto("0.5"), 5n * 10n ** 17n);
  assert.equal(f.tryAtto("1.2.3"), null);
  assert.equal(f.genText(15n * 10n ** 17n), "1.5");
  assert.equal(f.span(1200), "20 min");
  assert.equal(f.span(61), "1 min 1 s");
  assert.equal(f.span(90000), "1 d 1 h");
  assert.equal(f.durationLabel(120), "2 minutes");
  assert.equal(f.durationLabel(3600), "1 hour");
  assert.equal(f.durationLabel(2 * 86400), "2 days");
  assert.equal(f.durationLabel(90), "90 seconds");
  assert.equal(f.pct(1000), "10%");
  assert.equal(f.pct(250), "2.5%");
  assert.equal(f.pct(1), "0.01%");
  assert.equal(f.pageName("https://raw.githubusercontent.com/a/b/c/drafts/mug-final.html"), "mug-final.html");
  assert.equal(f.pageName("not a url"), "");
  assert.equal(f.fpShort("3a9c0d1e2f405162"), "3a9c…");
  assert.equal(f.short("0x5e1a3c9b07d24f68a1e3c5b7d9f0a2c4e6b8d0f1"), "0x5e1a…d0f1");
});
