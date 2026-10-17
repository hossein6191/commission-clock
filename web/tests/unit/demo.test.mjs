// The demo maker, without a network: the forgiving reader of its key, the limiter, its four demo jobs
// (each brief, its fixed script of eight moves and the verdict each should earn, its five drafts with
// their fingerprints recomputed from drafts/), which moves it will make on which commissions (only on
// a demo brief, word for word), and the server's routes read as source: a fixed list of actions, no
// visitor text ever signed, the key never logged or returned, and a status that names exactly what is
// missing.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

import { BAD_KEY, NO_KEY, cleanKey, keyProblem } from "../../lib/demo-key.ts";
import { DEMO_LIMITS, createLimiter } from "../../lib/demo-limit.ts";
import {
  ACTION_KEYS,
  DEMO_BRIEF,
  DEMO_JOBS,
  DEMO_STUDIO_NAME,
  DEMO_TERMS,
  DRAFTS,
  FETCH_FAILED,
  JOB_KEYS,
  LATER,
  actionOf,
  demoActProblem,
  demoActionFor,
  draftOf,
  draftOfUrl,
  draftUrl,
  expectedHolder,
  expectedVerdict,
  isDemoStudio,
  jobOf,
  jobOfBrief,
  offScript,
  repoOf,
  scriptedDelivery,
  scriptedPress,
} from "../../lib/demo-studio.ts";
import { MAX_NOTE, briefProblem, messageProblem, termsOfProblem, textProblem, urlProblem } from "../../lib/rules.ts";

const KEY = "ab".repeat(32);
const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the key is read forgivingly: quotes, spaces and a missing 0x are forgiven, anything else is named", () => {
  assert.equal(keyProblem(undefined), NO_KEY);
  assert.equal(keyProblem("  "), NO_KEY);
  assert.equal(keyProblem('""'), NO_KEY);
  for (const k of [KEY, "0x" + KEY, `"0x${KEY}"`, ` '${KEY}' `, "0X" + KEY, "`0x" + KEY + "`"]) {
    assert.equal(keyProblem(k), "", k);
    assert.equal(cleanKey(k), "0x" + KEY);
  }
  for (const k of ["key", "0x" + KEY.slice(2), KEY + "0", "0x" + "zz".repeat(32)]) assert.equal(keyProblem(k), BAD_KEY, k);
});

test("the limiter: one attempt per commission every 20 s, twelve a minute in all", () => {
  const l = createLimiter(DEMO_LIMITS);
  assert.deepEqual(l.attempt("C1", 0), { ok: true });
  assert.equal(l.attempt("C1", 5_000).ok, false);
  assert.equal(l.attempt("C1", 5_000).retryAfter, 15);
  assert.deepEqual(l.attempt("C1", 20_000), { ok: true });
  const g = createLimiter(DEMO_LIMITS);
  for (let i = 0; i < 12; i++) assert.equal(g.attempt("C" + i, 1000 + i).ok, true);
  assert.equal(g.attempt("C99", 2000).ok, false, "the thirteenth in a minute waits");
});

test("the demo studio's terms open, and its drafts are pinned addresses the contract takes", () => {
  assert.equal(termsOfProblem(DEMO_TERMS), "");
  assert.deepEqual(DEMO_TERMS, { feeAtto: 5n * 10n ** 17n, makerSeconds: 1200, clientSeconds: 600, stepSeconds: 120, cutBps: 1000, maxCutBps: 5000 });
  const commit = "0123456789abcdef0123456789abcdef01234567";
  for (const d of DRAFTS) {
    const url = draftUrl("demo-owner/commission-clock", commit, d.file);
    assert.equal(urlProblem(url), "", url);
    assert.equal(draftOfUrl(url), d);
    assert.deepEqual(scriptedDelivery(url), { verdict: d.expect, fp: d.fp });
    // Against each job's brief: its own pages as the demo expects, another job's page is about something else.
    for (const j of DEMO_JOBS) assert.deepEqual(scriptedDelivery(url, j.brief), { verdict: d.job === j.key ? d.expect : "missing", fp: d.fp }, `${d.file} on the ${j.key} brief`);
  }
  assert.deepEqual(scriptedDelivery("https://elsewhere.example/a.html"), { error: FETCH_FAILED });
  assert.equal(repoOf("https://github.com/demo-owner/commission-clock"), "demo-owner/commission-clock");
  assert.equal(repoOf("https://github.com/demo-owner/commission-clock.git"), "demo-owner/commission-clock");
  assert.equal(repoOf("https://example.com/x/y"), "");
});

test("each draft's fingerprint is the first 16 hex of the sha256 of its text, spacing collapsed, as every validator takes it", () => {
  // Every page in drafts/ is one the demo knows, and the site serves exactly those.
  const pages = (dir) => readdirSync(new URL(dir, import.meta.url)).filter((n) => n.endsWith(".html") && !n.startsWith("._")).sort();
  assert.deepEqual(pages("../../../drafts/"), DRAFTS.map((d) => d.file).sort(), "drafts/ holds exactly the demo's pages");
  assert.deepEqual(pages("../../public/drafts/"), DRAFTS.map((d) => d.file).sort(), "public/drafts/ holds exactly the same");
  assert.equal(new Set(DRAFTS.map((d) => d.fp)).size, DRAFTS.length, "no two pages share a fingerprint");
  for (const d of DRAFTS) {
    const raw = readFileSync(new URL(`../../../drafts/${d.file}`, import.meta.url), "utf8");
    const text = raw.slice(0, 32000).split(/\s+/).filter(Boolean).join(" ").slice(0, 8000);
    assert.equal(createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16), d.fp, d.file);
    // Plain text, as the contract's tests need every draft: printable ASCII, no markup, well under the page limit.
    assert.ok(/^[\x20-\x7e\n]*$/.test(raw) && !/[<>]/.test(raw), `${d.file} is plain ASCII text`);
    assert.ok(text.length < 8000, `${d.file} fits the page limit`);
    // The site serves the same bytes, so a visitor reads what the validators read.
    assert.equal(readFileSync(new URL(`../../public/drafts/${d.file}`, import.meta.url), "utf8"), raw, `public/drafts/${d.file} is a copy`);
  }
});

test("four demo jobs, the mug first: each brief is one the contract takes, states what a sham question asks and leaves one thing open", () => {
  assert.deepEqual(DEMO_JOBS.map((j) => j.key), JOB_KEYS);
  assert.deepEqual(JOB_KEYS, ["mug", "bakery", "cafe", "bike"]);
  assert.equal(jobOf("mug").brief, DEMO_BRIEF, "the mug is unchanged");
  assert.equal(new Set(DEMO_JOBS.map((j) => j.brief)).size, DEMO_JOBS.length);
  for (const j of DEMO_JOBS) {
    assert.equal(briefProblem(j.brief), "", j.key);
    assert.ok(j.brief.includes(j.stated), `the ${j.key} brief says "${j.stated}", which its sham question asks about`);
    assert.ok(j.open.length > 5 && j.title.length > 5, j.key);
    assert.equal(jobOfBrief(j.brief), j);
    // Word for word: not trimmed, not case-folded, not near enough.
    for (const near of [j.brief + " ", " " + j.brief, j.brief.toLowerCase(), j.brief.replace(/\.$/, ""), j.brief.replace(/,/, "")]) assert.equal(jobOfBrief(near), null, JSON.stringify(near));
  }
  assert.equal(jobOfBrief(""), null);
  assert.equal(jobOfBrief("Wording for a wedding invitation: two names, a date in June, a garden venue, and an RSVP line. Warm, not formal."), null);
});

test("each job's five drafts: the same five kinds, the mug's files unchanged, every verdict and fingerprint", () => {
  // The whole table, so a changed page or a changed verdict is a changed test.
  const want = {
    mug: [["placeholder", "mug-placeholder.html", "missing", "73903527c1f6a2b7"], ["outline", "mug-outline.html", "missing", "79e04b63ff3c8d09"], ["wrong", "teapot.html", "missing", "9b6a34ad97c9eaa5"], ["final", "mug-final.html", "delivered", "b9d43c8d6508c6f2"], ["revised", "mug-revised.html", "delivered", "bb05d8b80a5abdfd"]],
    bakery: [["placeholder", "bakery-placeholder.html", "missing", "00ebd0ee8b4d03de"], ["outline", "bakery-outline.html", "missing", "2dd024344eafc3a6"], ["wrong", "bakery-job-advert.html", "missing", "d1b937b46e3c0f2c"], ["final", "bakery-final.html", "delivered", "e3b739b0bc806533"], ["revised", "bakery-revised.html", "delivered", "154c4d2b9f08aca5"]],
    cafe: [["placeholder", "cafe-placeholder.html", "missing", "333c754db1723247"], ["outline", "cafe-outline.html", "missing", "8b46ac3da962dfd8"], ["wrong", "cafe-quiz-night.html", "missing", "f0d1a5d3268b419f"], ["final", "cafe-final.html", "delivered", "3dd6041ec26ab701"], ["revised", "cafe-revised.html", "delivered", "ccc1892908dae3c6"]],
    bike: [["placeholder", "bike-placeholder.html", "missing", "14f7c2721799b0d2"], ["outline", "bike-outline.html", "missing", "0daf583bc82ed623"], ["wrong", "bike-puncture-guide.html", "missing", "c868d1c466e064e9"], ["final", "bike-final.html", "delivered", "3aaffeaea3bf0ab0"], ["revised", "bike-revised.html", "delivered", "7186ed3703cbd05a"]],
  };
  for (const j of DEMO_JOBS) {
    assert.deepEqual(j.drafts.map((d) => [d.key, d.file, d.expect, d.fp]), want[j.key], j.key);
    for (const d of j.drafts) {
      assert.equal(d.job, j.key);
      assert.equal(draftOf(d.key, j.key), d);
    }
  }
  assert.deepEqual(DRAFTS, DEMO_JOBS.flatMap((j) => j.drafts), "DRAFTS is every job's five, in job order");
  // What the pages say, read as a validator would: the finished pieces carry what the brief asks for.
  const page = (f) => readFileSync(new URL(`../../../drafts/${f}`, import.meta.url), "utf8");
  for (const f of ["bakery-final.html", "bakery-revised.html"]) assert.match(page(f), /Saturday sourdough comes out of the oven at 8 am[\s\S]*unsubscribe/, f);
  assert.match(page("bakery-revised.html"), /free/);
  assert.doesNotMatch(page("bakery-final.html"), /free/);
  for (const f of ["cafe-final.html", "cafe-revised.html"]) {
    const t = page(f);
    for (const item of ["Espresso", "Flat white", "Hot chocolate", "Chai latte", "Mint tea", "Lemon drizzle", "Carrot cake", "Brownie"]) assert.match(t, new RegExp(`${item} - .* - \\d\\.\\d\\d`), `${f}: ${item} with its price`);
  }
  assert.match(page("cafe-revised.html"), /Oat milk/);
  assert.doesNotMatch(page("cafe-final.html"), /Oat milk/);
  for (const f of ["bike-final.html", "bike-revised.html"]) {
    assert.match(page(f), /fifteen years/, f);
    assert.equal(page(f).trim().split("\n").length, 1, `${f} is one paragraph`);
  }
  assert.match(page("bike-revised.html"), /wheelchairs and prams/);
  assert.doesNotMatch(page("bike-final.html"), /wheelchair/);
  for (const f of ["bakery-placeholder.html", "cafe-placeholder.html", "bike-placeholder.html"]) assert.match(page(f).trim(), /^[A-Za-z ]+: draft coming soon\.$/, f);
  for (const f of ["bakery-outline.html", "cafe-outline.html", "bike-outline.html"]) {
    const rows = page(f).trim().split("\n");
    assert.ok(rows[0].endsWith("outline") && rows.slice(2).every((r) => r.startsWith("- ")), f);
  }
  assert.doesNotMatch(page("bakery-job-advert.html"), /welcome|subscri|newsletter|sourdough/i);
  assert.doesNotMatch(page("cafe-quiz-night.html"), /espresso|flat white|latte|lemon drizzle|carrot cake|brownie|\d\.\d\d/i);
  assert.doesNotMatch(page("bike-puncture-guide.html"), /Spokes|Sprockets|years|2011/);
});

test("each job's script is fixed: three messages and five deliveries, each with the verdict it should earn wherever the move is", () => {
  assert.deepEqual(ACTION_KEYS, ["question", "sham", "update", "placeholder", "outline", "wrong", "final", "revised"]);
  const want = { question: "pass", sham: "keep", update: "keep", placeholder: "missing", outline: "missing", wrong: "missing", final: "delivered", revised: "delivered" };
  for (const j of DEMO_JOBS) {
    assert.deepEqual(j.actions.map((a) => a.key), ACTION_KEYS, j.key);
    for (const a of j.actions) {
      const at = `${j.key} ${a.key}`;
      assert.equal(a.job, j.key, at);
      assert.equal(a.expect, want[a.key], at);
      assert.equal(actionOf(a.key, j.key), a, at);
      assert.equal(demoActionFor(j.brief, a.key), a, at);
      assert.equal(a.kind, a.key === "question" || a.key === "sham" || a.key === "update" ? "say" : "deliver", at);
      assert.equal(textProblem(a.text, a.kind === "say" ? 1 : 0, a.kind === "say" ? 600 : MAX_NOTE, "x"), "", at);
      assert.ok(a.label.length > 5 && a.why.length > 10, at);
      if (a.kind === "say") {
        assert.equal(scriptedPress(a.text, j.brief), a.expect, `${at}: the mock reads it as the demo expects`);
        assert.equal(expectedVerdict(a, "client"), "noted", `${at} off the maker's turn is noted`);
        assert.equal(expectedHolder(a, "client"), "client");
      } else {
        assert.equal(a.draft, a.key, at);
        assert.equal(draftOf(a.draft, j.key).expect, a.expect, `${at}: the page is what the move promises`);
        assert.equal(expectedVerdict(a, "client"), a.expect, "a delivery is judged wherever the move is");
      }
      assert.equal(expectedHolder(a, "maker"), a.expect === "pass" || a.expect === "delivered" ? "client" : "maker", at);
    }
    // The real question names what the brief leaves open, which the brief itself does not answer.
    assert.notEqual(actionOf("question", j.key).text, actionOf("sham", j.key).text);
    assert.equal(actionOf("anything else", j.key), null);
    assert.equal(demoActionFor(j.brief, "anything else"), null);
  }
  assert.equal(demoActionFor("A brief that is not a demo job, of forty characters or more.", "final"), null, "no move for any other brief");
  // Each job's messages are its own: on another job's brief the mock does not know them.
  assert.equal(scriptedPress(actionOf("question", "cafe").text, jobOf("mug").brief), "unclear");
});

test("each job's client lines: a concrete answer passes, a promise keeps, a revision passes, praise keeps, a vague request is unclear", () => {
  for (const j of DEMO_JOBS) {
    const verdicts = j.lines.map((l) => l.expect);
    assert.ok(verdicts.filter((v) => v === "pass").length >= 2, `${j.key}: an answer and a revision`);
    assert.ok(verdicts.includes("keep") && verdicts.includes("unclear"), j.key);
    assert.equal(j.lines.find((l) => l.text === LATER)?.expect, "keep", `${j.key}: "I'll get back to you" keeps the move`);
    for (const l of j.lines) {
      assert.equal(messageProblem(l.text), "", `${j.key}: ${l.text}`);
      assert.equal(scriptedPress(l.text, j.brief), l.expect, `${j.key}: ${l.text}`);
    }
  }
  // A line in several jobs means the same in each, so the mock's reading off any demo brief is one.
  const seen = new Map();
  for (const j of DEMO_JOBS)
    for (const t of [...j.lines, ...j.actions.filter((a) => a.kind === "say")]) {
      if (seen.has(t.text)) assert.equal(seen.get(t.text), t.expect, t.text);
      seen.set(t.text, t.expect);
    }
  for (const [text, expect] of seen) assert.equal(scriptedPress(text), expect, `off a demo brief: ${text}`);
  assert.equal(scriptedPress("ok", jobOf("bakery").brief), "unclear");
});

test("the demo maker acts only on its own studio's commissions with a demo brief, in the right state, from its script", () => {
  const brief = jobOf("cafe").brief;
  const req = { id: "C3", studio: "S1", status: "requested", brief };
  const act = { id: "C3", studio: "S1", status: "active", brief };
  assert.equal(demoActProblem(req, "S1", "accept", true), "");
  for (const j of DEMO_JOBS) for (const k of ACTION_KEYS) assert.equal(demoActProblem({ ...act, brief: j.brief }, "S1", k, true), "", `${j.key} ${k}`);
  assert.equal(demoActProblem(act, "", "accept", true), "the demo studio is not open on this contract yet");
  assert.equal(demoActProblem(null, "S1", "accept", true), "there is no such commission");
  assert.equal(demoActProblem(act, "S1", "say anything", true), "the demo maker does only what its buttons say");
  assert.equal(demoActProblem({ ...act, studio: "S2" }, "S1", "question", true), "C3 is not a commission of the demo studio; only its own maker acts on it");
  assert.equal(demoActProblem(act, "S1", "accept", true), "C3 is active; the demo maker accepts only a request");
  assert.equal(demoActProblem({ ...act, status: "accepted" }, "S1", "question", true), "C3 is accepted; the demo maker acts only on an active commission");
  assert.match(demoActProblem(act, "S1", "final", false), /not pinned to a commit/);
  assert.equal(demoActProblem(act, "S1", "question", false), "", "without pinned drafts it can still talk");
  // Any other brief, word for word: no accept and no move, and the reason says so.
  const other = "Wording for a wedding invitation: two names, a date in June, a garden venue, and an RSVP line. Warm, not formal.";
  assert.equal(demoActProblem({ ...req, brief: other }, "S1", "accept", true), offScript("C3", true));
  assert.equal(offScript("C3", true), "C3's brief is not one of the 4 demo briefs word for word, so the demo maker has no script and no drafts for it and does not accept it; withdrawing it returns the whole fee");
  for (const k of ACTION_KEYS) assert.equal(demoActProblem({ ...act, brief: other }, "S1", k, true), offScript("C3", false), k);
  assert.equal(demoActProblem({ ...act, brief: brief + " " }, "S1", "final", true), offScript("C3", false), "near is not word for word");
  assert.equal(isDemoStudio({ maker: "0xAB", name: DEMO_STUDIO_NAME }, "0xab"), true);
  assert.equal(isDemoStudio({ maker: "0xab", name: "Another" }, "0xab"), false);
  assert.equal(isDemoStudio({ maker: "0xab", name: DEMO_STUDIO_NAME }, ""), false);
});

test("the routes take a fixed action key and a commission id, and nothing a visitor types is ever signed", () => {
  const act = src("../../app/api/demo/act/route.ts");
  assert.match(act, /ACTION_KEYS as string\[\]\)\.includes\(body\.action\)/, "the action must be one of the fixed keys");
  assert.match(act, /parseCommissionId\(body\.commission\)/);
  assert.match(act, /text\.length > 200/, "a long body is refused before it is parsed");
  assert.doesNotMatch(act, /body\.(text|message|url|note)/, "no free text is read from the body");
  const accept = src("../../app/api/demo/accept/route.ts");
  assert.match(accept, /sendDemo\(id, "accept"\)/);
  const server = src("../../lib/demo-server.ts");
  // An unknown key is refused before anything is read; the commission's brief, read fresh, is checked
  // against the demo jobs before anything is signed, and only picks which job's fixed move is signed.
  assert.match(server, /if \(what !== "accept" && !isActionKey\(what\)\) return \{ status: 400/);
  assert.match(server, /demoActProblem\(row \? \{ id: row\.id, studio: row\.studio, status: row\.status, brief: row\.brief \} : null, s\.studio, what, s\.drafts\)/);
  assert.ok(server.indexOf("demoActProblem(row") < server.indexOf("writeContract"), "the brief is checked before the signature");
  assert.match(server, /demoActionFor\(row!\.brief, what\)/);
  // What it signs comes from the script: the message text and the delivery note are the action's own.
  assert.match(server, /functionName: "say", args: \[commission, action\.text\]/);
  assert.match(server, /functionName: "deliver", args: \[commission, draftUrl\(repoOf\(REPO_URL\), draftsCommit\(\), draftOf\(action\.draft!, action\.job\)\.file\), action\.text\]/);
  assert.doesNotMatch(server, /args: \[[^\]]*brief/, "the brief is never signed");
});

test("the key is never logged or returned, and the status names exactly what is missing", () => {
  for (const p of ["../../lib/demo-server.ts", "../../app/api/demo/act/route.ts", "../../app/api/demo/accept/route.ts", "../../app/api/demo/status/route.ts"]) {
    const s = src(p);
    assert.doesNotMatch(s, /console\./, `${p} logs nothing`);
    assert.doesNotMatch(s, /\bkey:\s*(cleanKey|raw|process\.env)/, `${p} returns no key`);
  }
  const server = src("../../lib/demo-server.ts");
  // The status checks in order: the key, the contract, the RPC, the balance, the studio.
  const order = ["keyProblem(process.env.DEMO_MAKER_KEY)", "NO_CONTRACT_REASON", "RPC_DOWN", "NO_BALANCE", "NOT_OPEN"].map((k) => server.indexOf(k, server.indexOf("export async function demoStatusNow")));
  assert.ok(order.every((i) => i > 0), "every reason is checked");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "in that order");
  for (const reason of ["the contract is not deployed yet", "Studio's RPC did not answer", "holds no GEN", "the demo studio is not open on this contract yet", "not pinned to a commit"]) assert.ok(server.includes(reason), reason);
  const status = src("../../app/api/demo/status/route.ts");
  assert.match(status, /cache-control": "no-store"/);
});
