// The site against the contract it talks to, read from contracts/commission_clock.py in this
// repository: every write builder names a real write method with the right number of arguments and
// sends value only to the payable one; every view the site reads exists and the site reads every
// view; the limits and the four questions of each round are the contract's own; every refusal
// sentence the in-memory contract gives and every sentence the forms give is made of the contract's
// words; the readers of the caller's arguments answer as the contract's do; and the in-memory rules()
// is the contract's rules(), compared whole.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { calls } from "../../lib/calls.ts";
import * as rules from "../../lib/rules.ts";
import * as mock from "../../lib/chain-mock.ts";
import { askContract } from "./oracle.mjs";

// The contract's source with its escaped quotes read as quotes, and Python's adjacent string literals
// (a sentence split over two lines) joined back into one, so its sentences can be looked up whole.
const raw = readFileSync(new URL("../../../contracts/commission_clock.py", import.meta.url), "utf8");
const contract = raw
  .replace(/\\"/g, '"')
  .replace(/"\s*\n\s*"/g, "")
  .replace(/"\s*\n\s*\+\s*"/g, "")
  .replace(/"\s*\+\s*\n\s*"/g, "")
  .replace(/" "/g, "");
const chainSource = readFileSync(new URL("../../lib/chain.ts", import.meta.url), "utf8");
const mockSource = readFileSync(new URL("../../lib/chain-mock.ts", import.meta.url), "utf8");
const rulesSource = readFileSync(new URL("../../lib/rules.ts", import.meta.url), "utf8");

/** { name: { kind, payable, params } } for every public method of the contract. */
function methods() {
  const out = {};
  const re = /@gl\.public\.(write(?:\.payable)?|view)\s*\n\s*def (\w+)\(self(?:,\s*([^)]*))?\)/g;
  for (const m of raw.matchAll(re)) {
    const params = (m[3] ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    out[m[2]] = { kind: m[1].startsWith("view") ? "view" : "write", payable: m[1].endsWith("payable"), params: params.length };
  }
  return out;
}

/** The value of a Python constant written as `NAME = <expr>` at the start of a line. */
const constant = (name) => {
  const m = new RegExp(`^${name}\\s*=\\s*([^#\\n]+)`, "m").exec(raw);
  assert.ok(m, `the contract defines ${name}`);
  return m[1].trim();
};

/** A parenthesised Python string constant, joined. */
const pyString = (name) => {
  const start = raw.indexOf(`\n${name} = (`);
  assert.ok(start >= 0, `the contract defines ${name}`);
  const body = raw.slice(start, raw.indexOf("\n)", start));
  return [...body.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)].map((m) => (m[1] ?? m[2]).replace(/\\"/g, '"')).join("");
};

test("every write builder names a write method of the contract, with its arguments and its value", () => {
  const all = methods();
  const built = [
    calls.openStudio("Fernhill", "", 10n ** 18n, 1200, 600, 120, 1000, 5000),
    calls.closeStudio("S1"),
    calls.reopenStudio("S1"),
    calls.requestCommission("S1", "x".repeat(40), 10n ** 18n),
    calls.withdrawRequest("C1"),
    calls.decline("C1"),
    calls.accept("C1"),
    calls.say("C1", "hello"),
    calls.deliver("C1", "https://a.example/x.html", ""),
    calls.takeMove("C1"),
    calls.acceptWork("C1"),
    calls.claimSilence("C1"),
    calls.cancelLate("C1"),
  ];
  const writes = Object.entries(all).filter(([, m]) => m.kind === "write").map(([n]) => n).sort();
  assert.equal(writes.length, 13);
  assert.deepEqual([...new Set(built.map((c) => c.fn))].sort(), writes, "the site can send every write and nothing else");
  for (const c of built) {
    const m = all[c.fn];
    assert.equal(c.args.length, m.params, `${c.fn} takes ${m.params} arguments`);
    assert.equal(c.value !== undefined, m.payable, `${c.fn} sends value only when payable`);
  }
  const open = calls.openStudio("A studio", "", 15n * 10n ** 17n, 1200.9, 600, 120, 1000, 5000);
  assert.equal(open.args[2], "1500000000000000000", "the fee travels as a string of digits");
  assert.equal(open.args[3], 1200, "the seconds travel as integers");
  assert.equal(calls.requestCommission("S1", "brief", 5n).value, 5n, "the fee is the value sent");
});

test("every view the site reads is a view of the contract, and the site reads every view", () => {
  const all = methods();
  const read = [...chainSource.matchAll(/view\("(\w+)"/g)].map((m) => m[1]);
  const views = Object.entries(all).filter(([, m]) => m.kind === "view").map(([n]) => n);
  assert.equal(views.length, 9);
  for (const name of read) assert.equal(all[name]?.kind, "view", `${name} is a view`);
  for (const name of views) assert.ok(read.includes(name), `the site reads ${name}`);
  for (const name of views) assert.ok(mockSource.includes(`case "${name}":`), `the in-memory contract answers ${name}`);
  // Every list view is paged, at most PAGE rows, and the site never asks for more.
  assert.match(chainSource, /Math\.min\(PAGE, Math\.trunc\(limit\)\)/);
});

test("the limits are the contract's own", () => {
  const nums = {
    BPS: 10000, MIN_MAKER_SECONDS: 600, MIN_CLIENT_SECONDS: 300, MIN_STEP: 60, MIN_CUT_BPS: 1, MAX_CUT_BPS: 2500, MIN_MAX_CUT_BPS: 100, MAX_MAX_CUT_BPS: 9000,
    KILL_BPS: 2500, TURN_GRACE: 300, TURN_NOTICE: 300, MIN_NAME: 3, MAX_NAME: 60, MAX_ABOUT: 300, MIN_BRIEF: 40, MAX_BRIEF: 800, MIN_TEXT: 1, MAX_TEXT: 600,
    MAX_URL: 200, MAX_NOTE: 300, THREAD_WINDOW: 6, MAX_PAGE_TEXT: 8000, FP_CHARS: 16, PAGE: 20, ID_CHARS: 16, ADDRESS_CHARS: 42,
  };
  for (const [name, value] of Object.entries(nums)) {
    assert.equal(Number(constant(name)), value, `${name} in the contract`);
    assert.equal(rules[name], value, `${name} in lib/rules.ts`);
  }
  const products = { MAX_MAKER_SECONDS: ["60 * 86400", 60 * 86400], MAX_CLIENT_SECONDS: ["30 * 86400", 30 * 86400], MAX_STEP: ["7 * 86400", 7 * 86400], MAX_TO_CAP: ["30 * 86400", 30 * 86400], ACCEPT_WINDOW: ["7 * 86400", 7 * 86400], MAX_RAW_PAGE: ["4 * MAX_PAGE_TEXT", 32000] };
  for (const [name, [expr, value]] of Object.entries(products)) {
    assert.equal(constant(name), expr, `${name} in the contract`);
    assert.equal(rules[name], value, `${name} in lib/rules.ts`);
  }
  assert.equal(constant("MIN_FEE"), "ATTO // 10");
  assert.equal(rules.MIN_FEE, 10n ** 17n);
  assert.equal(constant("MAX_FEE"), "100 * ATTO");
  assert.equal(rules.MAX_FEE, 100n * 10n ** 18n);
  assert.equal(constant("THREAD_GAP"), JSON.stringify(rules.THREAD_GAP));
  assert.match(raw, /^URL_SIGNS = \("-", "\.", "_", "~", "\/", "\?", "&", "=", "%", "\+", ":", "@"\)$/m);
  assert.deepEqual(rules.URL_SIGNS, ["-", ".", "_", "~", "/", "?", "&", "=", "%", "+", ":", "@"]);
  assert.match(raw, /^HOST_SIGNS = \("-", "\."\)$/m);
});

test("the four questions of a press and of a delivery, the rules and the reading are the contract's own, word for word", () => {
  assert.equal(rules.QUESTION_HAND, pyString("QUESTION_HAND"));
  assert.equal(rules.QUESTION_CARRY, pyString("QUESTION_CARRY"));
  assert.equal(rules.QUESTION_THERE, pyString("QUESTION_THERE"));
  assert.equal(rules.QUESTION_MISSING, pyString("QUESTION_MISSING"));
  assert.equal(rules.PRESS_RULES, pyString("PRESS_RULES"));
  assert.equal(rules.READING, pyString("READING"));
});

/** The text of every call `name(...)` in a source, with its parentheses balanced (strings respected). */
function argsOf(source, name) {
  const out = [];
  let at = 0;
  for (;;) {
    const i = source.indexOf(name + "(", at);
    if (i < 0) return out;
    let depth = 0;
    let j = i + name.length;
    let quote = "";
    for (; j < source.length; j++) {
      const ch = source[j];
      if (quote) {
        if (ch === "\\") j++;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "`" || ch === "'") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) break;
    }
    out.push(source.slice(i + name.length + 1, j));
    at = j;
  }
}

/** Every string literal in an expression, cut at its ${...} holes: the pieces of a sentence the code writes itself. */
function pieces(expr) {
  const out = [];
  for (const m of expr.matchAll(/"((?:[^"\\]|\\.)*)"|`([^`]*)`/g)) {
    const text = (m[1] ?? m[2]).replace(/\\"/g, '"');
    for (const part of text.split(/\$\{[^}]*\}/)) {
      const p = part.trim().replace(/^[;:,.]\s*/, "");
      if (p.length >= 8) out.push(p);
    }
  }
  return out;
}

test("every refusal the in-memory contract gives is in the contract's own words", () => {
  const raised = argsOf(mockSource, "fail").filter((a) => /["`]/.test(a));
  assert.ok(raised.length >= 30, `found ${raised.length} refusals`);
  for (const r of raised) for (const p of pieces(r)) assert.ok(contract.includes(p), `the contract says "${p}"`);
  const refused = [...mockSource.matchAll(/problem =\s*([\s\S]*?);\n/g)].map((m) => m[1]).filter((a) => /["`]/.test(a));
  assert.ok(refused.length >= 6, `found ${refused.length} payable refusals`);
  for (const r of refused) for (const p of pieces(r)) assert.ok(contract.includes(p), `the contract says "${p}"`);
});

test("every sentence the forms give in lib/rules.ts is in the contract's own words", () => {
  const start = rulesSource.indexOf("// ---- reading the caller");
  const end = rulesSource.indexOf("// ---- what the site sends");
  const said = [...rulesSource.slice(start, end).matchAll(/return\s+\(?\s*([^;]+);/g)].map((m) => m[1]).filter((a) => /"/.test(a));
  assert.ok(said.length >= 10, `found ${said.length} sentences`);
  for (const r of said) for (const p of pieces(r)) assert.ok(contract.includes(p), `the contract says "${p}"`);
});

test("the readers of the caller's arguments answer as the contract's do", (t) => {
  const texts = [
    ["", 1, 600, "a message"],
    ["Sea-green, please.", 1, 600, "a message"],
    ["two\nlines", 1, 600, "a message"],
    ["café", 1, 600, "a message"],
    ["x".repeat(601), 1, 600, "a message"],
    ["short brief", 40, 800, "the brief"],
    ["tab\there", 0, 300, "the note"],
    ["<b>angle brackets are fine</b>", 1, 600, "a message"],
  ];
  const urls = [
    "https://raw.githubusercontent.com/demo-owner/commission-clock/0123456789abcdef0123456789abcdef01234567/drafts/mug-final.html",
    "http://studio.example/page",
    "https://Studio.example/page",
    "https://studio/page",
    "https://studio.example/a page",
    "https://studio.example/p?q=1&r=two%20",
    "https://user@studio.example/x",
    "https://.studio.example/x",
    "https://studio.example./x",
    "https://studio_example.com/x",
    "https://" + "a".repeat(200) + ".example",
    "https://stüdio.example/x",
    "https://studio.example",
  ];
  const numbers = [0, 5, -1, "12", " 7 ", "1.5", "abc", "", "1".repeat(41), true, null, 3.5, "١"];
  const answers = askContract([
    ...texts.map((a) => ({ fn: "_text_problem", args: a })),
    ...urls.map((u) => ({ fn: "_url_problem", args: [u] })),
    ...numbers.map((n) => ({ fn: "_number_arg", args: [n] })),
  ]);
  if (!answers) return t.skip("no python3 on this machine");
  let k = 0;
  for (const a of texts) assert.equal(rules.textProblem(...a), answers[k++].ok, `text ${JSON.stringify(a[0]).slice(0, 30)}`);
  for (const u of urls) assert.equal(rules.urlProblem(u), answers[k++].ok, `url ${u.slice(0, 50)}`);
  for (const n of numbers) assert.equal(rules.numberArg(n).toString(), String(answers[k++].ok), `number ${JSON.stringify(n)}`);
});

test("the terms a studio may open with are refused exactly where the contract refuses them", async () => {
  const G = 10n ** 18n;
  const cases = [
    [G, 1200n, 600n, 120n, 1000n, 5000n],
    [G / 20n, 1200n, 600n, 120n, 1000n, 5000n],
    [G, 599n, 600n, 120n, 1000n, 5000n],
    [G, 1200n, 299n, 120n, 1000n, 5000n],
    [G, 1200n, 600n, 59n, 1000n, 5000n],
    [G, 1200n, 600n, 120n, 2501n, 5000n],
    [G, 1200n, 600n, 120n, 1000n, 9001n],
    [G, 1200n, 600n, 120n, 2000n, 1000n],
    [G, 1200n, 600n, 7n * 86400n, 1n, 9000n],
    [G, 1200n, 600n, 86400n, 100n, 3000n],
  ];
  for (const [fee, maker, client, step, cut, cap] of cases) {
    const expected = rules.termsProblem({ fee, maker, client, step, cut, cap });
    mock.setMockPersona(mock.PASSER_BY);
    const hash = await mock.write(calls.openStudio("Terms check", "", fee, Number(maker), Number(client), Number(step), Number(cut), Number(cap)));
    let s;
    for (let i = 0; i < 20; i++) {
      s = await mock.txStatus(hash);
      if (s.status === "FINALIZED") break;
    }
    if (expected) assert.equal(s.message, "[EXPECTED] " + expected);
    else assert.equal(s.result?.ok, true, "a studio inside every limit opens");
  }
});

test("the in-memory rules() is the contract's rules(), whole", async (t) => {
  const mine = JSON.parse(await mock.view("rules", []));
  const answers = askContract([{ fn: "rules" }]);
  if (!answers) return t.skip("no python3 on this machine");
  assert.deepEqual(mine, answers[0].ok);
});
