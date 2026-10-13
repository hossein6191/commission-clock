// The demo maker, without a network: the forgiving reader of its key, the limiter, which moves it will
// make on which commissions, the five drafts it delivers (their fingerprints recomputed from drafts/),
// and the server's routes read as source: a fixed list of actions, no visitor text ever signed, the
// key never logged or returned, and a status that names exactly what is missing.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { BAD_KEY, NO_KEY, cleanKey, keyProblem } from "../../lib/demo-key.ts";
import { DEMO_LIMITS, createLimiter } from "../../lib/demo-limit.ts";
import {
  ACTION_KEYS,
  DEMO_ACTIONS,
  DEMO_STUDIO_NAME,
  DEMO_TERMS,
  DRAFTS,
  FETCH_FAILED,
  actionOf,
  demoActProblem,
  draftOfUrl,
  draftUrl,
  expectedHolder,
  expectedVerdict,
  isDemoStudio,
  repoOf,
  scriptedDelivery,
} from "../../lib/demo-studio.ts";
import { termsOfProblem, urlProblem } from "../../lib/rules.ts";

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
  }
  assert.deepEqual(scriptedDelivery("https://elsewhere.example/a.html"), { error: FETCH_FAILED });
  assert.equal(repoOf("https://github.com/demo-owner/commission-clock"), "demo-owner/commission-clock");
  assert.equal(repoOf("https://github.com/demo-owner/commission-clock.git"), "demo-owner/commission-clock");
  assert.equal(repoOf("https://example.com/x/y"), "");
});

test("each draft's fingerprint is the first 16 hex of the sha256 of its text, spacing collapsed, as every validator takes it", () => {
  for (const d of DRAFTS) {
    const raw = readFileSync(new URL(`../../../drafts/${d.file}`, import.meta.url), "utf8");
    const text = raw.slice(0, 32000).split(/\s+/).filter(Boolean).join(" ").slice(0, 8000);
    assert.equal(createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16), d.fp, d.file);
    // The site serves the same bytes, so a visitor reads what the validators read.
    assert.equal(readFileSync(new URL(`../../public/drafts/${d.file}`, import.meta.url), "utf8"), raw, `public/drafts/${d.file} is a copy`);
  }
});

test("the script is fixed: three messages and five deliveries, each with the verdict it should earn wherever the move is", () => {
  assert.deepEqual(ACTION_KEYS, ["question", "sham", "update", "placeholder", "outline", "wrong", "final", "revised"]);
  for (const a of DEMO_ACTIONS) {
    assert.equal(actionOf(a.key), a);
    if (a.kind === "say") {
      assert.equal(expectedVerdict(a, "client"), "noted", `${a.key} off the maker's turn is noted`);
      assert.equal(expectedHolder(a, "client"), "client");
    } else assert.equal(expectedVerdict(a, "client"), a.expect, "a delivery is judged wherever the move is");
  }
  assert.equal(expectedHolder(actionOf("question"), "maker"), "client");
  assert.equal(expectedHolder(actionOf("sham"), "maker"), "maker");
  assert.equal(expectedHolder(actionOf("final"), "maker"), "client");
  assert.equal(expectedHolder(actionOf("placeholder"), "maker"), "maker");
  assert.equal(actionOf("anything else"), null);
});

test("the demo maker acts only on its own studio's commissions, in the right state, from its script", () => {
  const req = { id: "C3", studio: "S1", status: "requested" };
  const act = { id: "C3", studio: "S1", status: "active" };
  assert.equal(demoActProblem(req, "S1", "accept", true), "");
  assert.equal(demoActProblem(act, "S1", actionOf("final"), true), "");
  assert.equal(demoActProblem(act, "", "accept", true), "the demo studio is not open on this contract yet");
  assert.equal(demoActProblem(null, "S1", "accept", true), "there is no such commission");
  assert.equal(demoActProblem(act, "S1", null, true), "the demo maker does only what its buttons say");
  assert.equal(demoActProblem({ ...act, studio: "S2" }, "S1", actionOf("question"), true), "C3 is not a commission of the demo studio; only its own maker acts on it");
  assert.equal(demoActProblem(act, "S1", "accept", true), "C3 is active; the demo maker accepts only a request");
  assert.equal(demoActProblem({ ...act, status: "accepted" }, "S1", actionOf("question"), true), "C3 is accepted; the demo maker acts only on an active commission");
  assert.match(demoActProblem(act, "S1", actionOf("final"), false), /not pinned to a commit/);
  assert.equal(demoActProblem(act, "S1", actionOf("question"), false), "", "without pinned drafts it can still talk");
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
  // What it signs comes from the script: the message text and the delivery note are the action's own.
  assert.match(server, /functionName: "say", args: \[commission, action\.text\]/);
  assert.match(server, /functionName: "deliver", args: \[commission, draftUrl\(repoOf\(REPO_URL\), draftsCommit\(\), draftOf\(action\.draft!\)\.file\), action\.text\]/);
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
