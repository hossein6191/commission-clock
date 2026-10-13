/* Commission Clock against GenLayer Studio (chain 61999), with throwaway accounts. Deploys its own copy.
 *
 *   npm ci                                                   # genlayer-js 1.1.8 and viem 2.56.8, pinned by package-lock.json
 *   COMMIT=<sha> node tests/on_chain/smoke.mjs               # the whole run, about fifty minutes
 *   COMMIT=<sha> RESUME=1 node tests/on_chain/smoke.mjs      # continue a run that was cut off, from the saved state
 *   STATE=/some/dir/run.json ...                             # the state file: keys, contract address, every step made
 *   FRESH=1 ...                                              # start over even though a saved run exists
 *
 * The validators read the drafts from raw.githubusercontent.com, pinned to one commit, so the page every node
 * fetches is the same bytes. Push the repository first and pass that commit as COMMIT (40 hex characters). REPO
 * is "<owner>/<name>" on GitHub; when it is not set it is read from `git remote get-url origin`. The script
 * fetches the drafts itself before it deploys anything, and stops if they are not there.
 *
 * Three accounts the script generates and funds itself play the whole story: MAKER is the potter who opens
 * Fernhill Pottery, CLIENT is the shop that commissions it, STRANGER tries what only the two of them may do. The
 * studio's terms are short so the clock can be watched: a 1 GEN fee, 900 seconds for the maker, 420 for the
 * client, and a cut of 10% of the fee for every started minute the maker is over, at most 50%.
 *
 * Phases:
 *   A  deploy; MAKER opens S1. STRANGER tries to close it and is refused. CLIENT commissions it three times with
 *      the same brief (C1, C2, C3); each 1 GEN is held. MAKER tries to commission its own studio: refused, and
 *      the 1 GEN comes back in the same transaction. STRANGER tries to accept C1 and is refused. MAKER accepts
 *      C3, so its clock starts now; CLIENT tries to cancel C3 at once and is refused, the cut is nowhere near
 *      its cap. MAKER accepts C2 and delivers drafts/mug-final.html: every validator fetches it and the move
 *      goes to CLIENT. MAKER claims CLIENT's silence at once and is refused. That claim is sent only after the
 *      chain's clock shows at least four minutes before it could open; if the deliver round and its wait used
 *      more, the check is reported as SKIP rather than raced.
 *   B  the conversation on C1, one consensus round per press:
 *        MAKER accepts C1; CLIENT thanks it while MAKER holds the move: noted, nobody asked
 *        MAKER asks which glaze to name, which the brief leaves open           pass, the move to CLIENT
 *        CLIENT: "I'll get back to you on that."                               keep, still CLIENT's
 *        CLIENT: "Sea-green, please."                                          pass, the move to MAKER
 *        MAKER asks whether to write in English, which the brief already says  keep
 *        MAKER: "Working on it, nearly there."                                 keep
 *        MAKER delivers drafts/mug-placeholder.html                            missing, nothing changes
 *        MAKER delivers drafts/mug-final.html                                  delivered, the move to CLIENT
 *      CLIENT accepts the work: the split is checked against the seconds the contract stored.
 *   C  on the chain's clock: once CLIENT has sat on C2 past its 420 seconds, MAKER claims its silence and C2
 *      settles as accepted; once MAKER's cut on C3 has reached the cap, CLIENT cancels it and gets the 1 GEN back.
 *      A turn handed over by a judged message or a delivery is not charged for its first 300 seconds, and neither
 *      settlement opens before the current turn has been charged 300 seconds; the waits read both from the view.
 *   D  the deployed code is read back and compared with contracts/commission_clock.py byte for byte; the views
 *      are checked against what the run did; the contract holds nothing; every account ends where the money
 *      says: MAKER up exactly what CLIENT is down, STRANGER whole.
 *
 * Every refusal is a signed transaction. Balances are read before and after every step that moves money.
 * Transactions are polled with eth_getTransactionByHash, never with views (gen_call is limited to 30 a minute
 * per client, shared with sim_fundAccount). A round the validators do not carry stores nothing; it is sent again
 * and both transactions are kept. Every id is read from the receipt of the call that made it. Every step is saved
 * as it is made, so a run cut off by a closed laptop continues with RESUME=1 without sending anything twice.
 */
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { generatePrivateKey } from "viem/accounts";
import { getAddress } from "viem";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const STATE = process.env.STATE || join(tmpdir(), "commission-clock-smoke-state.json");
const RECORD = process.env.RECORD || STATE.replace(/\.json$/, "") + "-record.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const rpc = async (m, p) => {
  let last;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error && (j.error.code === -32029 || r.status === 429)) { await sleep(((j.error.data?.retry_after_seconds) || 20) * 1000); continue; }
      if (j.error) { last = new Error(m + ": " + JSON.stringify(j.error).slice(0, 200)); await sleep(6000); continue; }
      return j.result;
    } catch (e) { last = e; await sleep(4000); }   // the connection itself failed, or the answer was not JSON
  }
  throw last;
};
let pass = 0, fail = 0, skipped = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  - " + d : ""}`); return !!c; };
const skip = (n, d = "") => { skipped++; console.log(`SKIP  ${n}${d ? "  - " + d : ""}`); };
const note = (s) => console.log(`      .. ${s}`);
const GEN = 10n ** 18n;
const tally = (v) => `${v.agree} agree, ${v.disagree} disagree, ${v.idle} idle`;
const sha = (text) => createHash("sha256").update(text).digest("hex");

// ---------- where the validators will read the drafts ----------
const COMMIT = String(process.env.COMMIT || "").trim();
if (!/^[0-9a-f]{40}$/.test(COMMIT)) {
  console.log("COMMIT must be the 40-character commit the drafts were pushed in: COMMIT=<sha> node tests/on_chain/smoke.mjs");
  process.exit(2);
}
let REPO = String(process.env.REPO || "").trim();
if (!REPO) {
  try {
    const origin = execSync("git remote get-url origin", { cwd: new URL("../..", import.meta.url), encoding: "utf8" }).trim();
    REPO = (origin.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/) || [])[1] || "";
  } catch (e) { REPO = ""; }
}
if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(REPO)) {
  console.log("REPO must be <owner>/<name> on GitHub (or set the git remote origin): REPO=<owner>/commission-clock COMMIT=<sha> ...");
  process.exit(2);
}
const RAW = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/drafts/`;
const PAGE = { final: RAW + "mug-final.html", placeholder: RAW + "mug-placeholder.html" };
const LOCAL = {};
for (const [name, address] of Object.entries(PAGE)) {
  LOCAL[name] = readFileSync(new URL("../../drafts/" + address.slice(RAW.length), import.meta.url), "utf8");
  let there = "";
  try { const r = await fetch(address); there = r.ok ? await r.text() : ""; } catch (e) { there = ""; }
  if (there !== LOCAL[name]) {
    console.log(`${address}\ndoes not serve drafts/${address.slice(RAW.length)} as it is in this checkout. Push the repository and pass that commit as COMMIT.`);
    process.exit(2);
  }
}
// what every validator should fingerprint: the text with its spacing collapsed, at most 8,000 characters
const fpOf = (text) => sha(text.split(/\s+/).filter(Boolean).join(" ").slice(0, 8000)).slice(0, 16);

// ---------- state: keys, the contract address and every step already made survive a cut-off run ----------
if (existsSync(STATE) && !process.env.RESUME && !process.env.FRESH) {
  console.log(`A saved run exists at ${STATE}.\nRESUME=1 continues it; FRESH=1 starts over; STATE=<path> keeps another.`);
  process.exit(2);
}
const st = existsSync(STATE) && process.env.RESUME && !process.env.FRESH ? JSON.parse(readFileSync(STATE, "utf8")) : {};
st.keys = st.keys || {}; st.steps = st.steps || {}; st.views = st.views || {}; st.order = st.order || [];
st.commit = st.commit || COMMIT; st.repo = st.repo || REPO;
if (st.commit !== COMMIT) { console.log(`This saved run used commit ${st.commit}; continue it with that COMMIT, or start over with FRESH=1.`); process.exit(2); }
const save = () => {
  writeFileSync(STATE, JSON.stringify(st, null, 1));
  const { keys, ...shown } = st;       // the record carries no key
  writeFileSync(RECORD, JSON.stringify(shown, null, 1));
};
const ROLES = { maker: "MAKER, the potter of Fernhill Pottery", client: "CLIENT, the shop", stranger: "STRANGER" };
for (const k of Object.keys(ROLES)) st.keys[k] = st.keys[k] || generatePrivateKey();
const acct = {}, client = {};
for (const k of Object.keys(ROLES)) { acct[k] = createAccount(st.keys[k]); client[k] = createClient({ chain: studionet, account: acct[k] }); }
const rd = createClient({ chain: studionet });
st.accounts = Object.fromEntries(Object.keys(ROLES).map((k) => [k, getAddress(acct[k].address)]));
save();

const balance = async (a) => BigInt(await rpc("eth_getBalance", [a, "latest"]) || "0x0");
const nonceOf = async (a) => Number(BigInt(await rpc("eth_getTransactionCount", [a, "latest"]) || "0x0"));
const fundOnce = async (k, whole) => {
  st.funded = st.funded || {};
  if (st.funded[k]) return;
  await rpc("sim_fundAccount", { account_address: getAddress(acct[k].address), amount: whole * 1e18 });   // checksummed
  for (let i = 0; i < 20 && (await balance(acct[k].address)) === 0n; i++) await sleep(3000);
  st.funded[k] = String(await balance(acct[k].address)); save();
};

// ---------- transactions ----------
const errText = (e) => String(e?.details || e?.shortMessage || e?.cause?.message || e?.message || e);
// A request the network refused or never received is made again. When the failure is ambiguous the
// sender's nonce says whether the transaction landed after all, and its hash is read back, so nothing
// is ever sent twice.
const sendRaw = async (who, what, make) => {
  const addr = acct[who].address;
  for (let i = 0; ; i++) {
    const n0 = await nonceOf(addr);
    try { return await make(); } catch (e) {
      const text = errText(e);
      if (i >= 8) throw e;
      console.log(`      ${what} was not taken (${text.slice(0, 70)}); looking again in 20s`);
      await sleep(20000);
      if ((await nonceOf(addr)) > n0) {
        const list = await rpc("sim_getTransactionsForAddress", [addr]);
        const hit = (list || []).find((t) => String(t.from_address).toLowerCase() === addr.toLowerCase() && Number(t.nonce) === n0);
        if (hit?.hash) return hit.hash;
        throw new Error(what + " landed but its hash could not be read back");
      }
    }
  }
};
const countVotes = (t) => { let a = 0, d = 0, idl = 0; for (const k in (t.consensus_data?.votes || {})) { const v = t.consensus_data.votes[k]; if (v === "agree") a++; else if (v === "disagree") d++; else idl++; } return { agree: a, disagree: d, idle: idl }; };
const wait = async (tx) => {
  let stuck = 0;
  for (let i = 0; i < 900; i++) {
    await sleep(4000);
    const t = await rpc("eth_getTransactionByHash", [tx]);
    if (t?.status === "FINALIZED") {
      const lr = t.consensus_data?.leader_receipt, one = Array.isArray(lr) ? lr[0] : lr;
      let msg = "";
      try { msg = Buffer.from(one.result, "base64").toString("utf8").replace(/[^\x20-\x7e]/g, " ").trim(); } catch (e) {}
      const v = countVotes(t);
      return { tx, msg, exec: one?.execution_result || "", votes: v, applied: v.agree * 2 > v.agree + v.disagree + v.idle, address: t.data?.contract_address || t.to_address || "" };
    }
    // a round no majority carried is final as it stands once it has been left alone for ten minutes
    if (t?.status === "UNDETERMINED" && (stuck = stuck + 1) > 150) return { tx, msg: "UNDETERMINED", exec: "", votes: countVotes(t), applied: false, address: "" };
    if (t?.status === "CANCELED") return { tx, msg: "CANCELED", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
    if (i > 0 && i % 75 === 0) console.log(`      [${stamp()}] still ${t?.status || "unknown"} after ${Math.round(i * 4 / 60)} minutes: ${tx}`);
  }
  return { tx, msg: "TIMEOUT", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
};
const jsonOf = (msg) => { const b = String(msg).indexOf("{"); if (b === -1) return null; try { return JSON.parse(String(msg).slice(b)); } catch (e) { return null; } };
const settleBalance = async (a, before, want) => { for (let i = 0; i < 45; i++) { const b = await balance(a); if (b - before === want) return b; await sleep(4000); } return await balance(a); };

// One step of the run: a signed transaction, its tally, what it returned, and the balances it moved.
// opt.value is what is sent with it; opt.watch names the accounts whose balances are read before and
// after; opt.expect is the change each should show once every transfer has landed, a table or a
// function of what the call returned. A step already in the saved state is not sent again.
const call = async (id, who, fn, args = [], opt = {}) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn, args: args.map(String), value: String(opt.value || 0n), tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const watch = opt.watch || [];
    if (!rec.before) { rec.before = {}; for (const k of watch) rec.before[k] = String(await balance(acct[k].address)); save(); }
    let r;
    for (;;) {
      if (!rec.pending) {
        rec.pending = await sendRaw(who, fn, () => client[who].writeContract({ address: st.contract, functionName: fn, args, ...(opt.value ? { value: opt.value } : {}) }));
        save();
      }
      r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg, at: stamp() });
      rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} ${fn}(${args.map((x) => String(x).slice(-30)).join(", ")})${opt.value ? " +" + Number(opt.value) / 1e18 + " GEN" : ""}  ${r.tx}  ${tally(r.votes)}  ${r.exec}`);
      if (r.msg === "TIMEOUT" || rec.tries.length >= 4) break;
      if (!r.applied) { console.log("      the validators did not carry that round (" + tally(r.votes) + "), so nothing was stored; sending it again"); continue; }
      break;
    }
    const expect = typeof opt.expect === "function" ? opt.expect(jsonOf(r.msg)) : opt.expect;
    rec.after = {}; rec.delta = {};
    for (const k of watch) {
      const before = BigInt(rec.before[k]);
      const want = expect && expect[k] !== undefined ? BigInt(expect[k]) : null;
      const now = want === null ? await balance(acct[k].address) : await settleBalance(acct[k].address, before, want);
      rec.after[k] = String(now); rec.delta[k] = String(now - before);
    }
    rec.done = true; save();
  }
  const last = rec.tries[rec.tries.length - 1];
  return { ...last, j: jsonOf(last.msg), tries: rec.tries, delta: rec.delta || {} };
};
const refused = (r, words) => r.exec === "ERROR" && r.msg.includes(words);
const moved = (r, k, want) => r.delta[k] === String(want);
const votes = (r) => r.tries.map((t) => tally(t.votes)).join(", then ");

const deploy = async (id, who, path) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn: "deploy " + path.split("/").pop(), args: [], value: "0", tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const code = readFileSync(new URL(path, import.meta.url));
    for (;;) {
      if (!rec.pending) { rec.pending = await sendRaw(who, "deploy", () => client[who].deployContract({ code, args: [], leaderOnly: false })); save(); }
      const r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg.slice(0, 300), at: stamp() });
      rec.address = r.address; rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} deploy ${path.split("/").pop()}  ${r.tx}  ${tally(r.votes)}  ${r.exec}  ${r.address}`);
      if (r.applied || r.msg === "TIMEOUT" || rec.tries.length >= 3) break;
    }
    rec.done = true; save();
  }
  return rec.address;
};

// ---------- reads: paced, and made again on a 429 or on "Contract not found" instead of failing ----------
let lastRead = 0;
const read = async (fn, args = []) => {
  for (let i = 0; i < 30; i++) {
    const gap = 3500 - (Date.now() - lastRead);
    if (gap > 0) await sleep(gap);
    lastRead = Date.now();
    try { return JSON.parse(String(await rd.readContract({ address: st.contract, functionName: fn, args }))); } catch (e) {
      if (i === 29) return { error: "VIEW ERROR " + fn + ": " + errText(e).slice(0, 100) };
      await sleep(/rate|429|limit/i.test(errText(e)) ? 25000 : 10000);
    }
  }
};
// a view read once for a check is kept with the run, so a continued run checks what was seen then
const seen = async (id, fn, args = []) => { if (!st.views[id]) { st.views[id] = { fn, args, at: stamp(), out: await read(fn, args) }; save(); } return st.views[id].out; };

// Seconds until a settlement against `side` opens, from commission(id): the view returns the stored clock (holder,
// since, grace, used per side) and its own reading of the chain's clock. The side's running turn is charged from
// since + grace; the settlement opens once its live use is past `beyond` and this turn has been charged TURN_NOTICE,
// each with `margin` seconds to spare.
const MARGIN = 30;
const opensIn = (r, side, beyond, margin = 0) => {
  const now = Number(r.now) > 0 ? Number(r.now) : Math.floor(Date.now() / 1000);
  const since = Number(r.since), grace = Number(r.grace) || 0, booked = Number(r[side + "_used"]);
  const charged = Math.max(0, now - since - grace);
  const need = Math.max(TURN_NOTICE + margin, beyond + margin + 1 - booked);
  return Math.max(0, since + grace - now) + Math.max(0, need - charged);
};
// wait on the chain's own clock until a settlement against `side` has opened, with a margin
const untilOpen = async (cid, side, beyond) => {
  for (;;) {
    const r = await read("commission", [cid]);
    if (!r || r.error || !(Number(r.since) > 0)) { note(`commission ${cid} could not be read (${r?.error || "no clock"}); reading again`); await sleep(15000); continue; }
    if (r.holder !== side) { note(`${side} does not hold the move on ${cid} (${r.holder || "no clock"}); not waiting`); return r; }
    const left = opensIn(r, side, beyond, MARGIN);
    if (left <= 0) return r;
    console.log(`      [${stamp()}] waiting ${left}s until the ${side}'s use of ${cid} is past ${beyond}s and its turn past the notice (live ${r[side + "_live"]}s)`);
    await sleep(Math.min(left, 120) * 1000);
  }
};

// ---------- the demonstration: one studio, one brief, the same messages and pages as tests/test_pure.py ----------
const STUDIO_NAME = "Fernhill Pottery";
const ABOUT = "Hand-thrown stoneware and the words that sell it.";
const FEE = GEN, MAKER_SECONDS = 900, CLIENT_SECONDS = 420, STEP = 60, CUT = 1000, CAP = 5000;
const TURN_GRACE = 300, TURN_NOTICE = 300;       // the contract's own; the waits are worked out from the view's grace
const CAP_AFTER = MAKER_SECONDS + (Math.ceil(CAP / CUT) - 1) * STEP;     // 1140 s of the maker's use
const BRIEF = "A 150-word product description for a hand-thrown stoneware mug, 350 ml, for an online shop. Warm, plain English. Mention that it is dishwasher safe.";
const THANKS = "Thank you for taking this on. The mug goes in our autumn listing.";
const GLAZE_Q = "Which glaze should the description name? We make this mug in sea-green, oatmeal and charcoal, and the brief does not say which one this listing is for, so I need you to choose before I write it.";
const LATER = "I'll get back to you on that.";
const SEA_GREEN = "Sea-green, please.";
const ENGLISH_Q = "Should the description be written in English?";
const UPDATE = "Working on it, nearly there.";
const QUESTION_HAND = "After this new message from the {holder}, is the {holder} now waiting for something only the {other} can give (an answer, a decision, material, or a review) that this message actually asks for or hands over? Answer yes, no or unclear.";
const QUESTION_THERE = "Does this page contain the finished piece the brief asks for, the actual work complete enough for the client to review, rather than a placeholder, an outline, a promise, a fragment or something else? Answer yes, no or unclear.";
// the split the contract must make from the seconds it stored
const split = (j) => {
  const late = Math.max(0, Number(j?.maker_used) - MAKER_SECONDS);
  const bps = Math.min(CAP, Math.ceil(late / STEP) * CUT);
  const cut = FEE * BigInt(bps) / 10000n;
  return { late, bps, toMaker: FEE - cut, toClient: cut };
};
const splitOk = (j) => {
  const s = split(j);
  return j && Number(j.maker_late) === s.late && Number(j.cut_bps) === s.bps && j.to_maker === String(s.toMaker) && j.to_client === String(s.toClient);
};

await fundOnce("maker", 10); await fundOnce("client", 10); await fundOnce("stranger", 5);
if (!st.start) { st.start = {}; for (const k of Object.keys(ROLES)) st.start[k] = String(await balance(acct[k].address)); st.started = new Date().toISOString(); save(); }
console.log(`[${stamp()}] ${Object.keys(ROLES).map((k) => k.toUpperCase().padEnd(8) + " " + st.accounts[k]).join("\n           ")}\n           drafts ${RAW}\n           state ${STATE}`);

// ================================================================ phase A
console.log(`\n[${stamp()}] ---- phase A: deploy, the studio, three commissions, two clocks started`);
st.contract = st.contract || await deploy("deploy", "maker", "../../contracts/commission_clock.py");
save();
console.log(`      Commission Clock at ${st.contract}`);
const open = await call("openStudio", "maker", "open_studio", [STUDIO_NAME, ABOUT, String(FEE), MAKER_SECONDS, CLIENT_SECONDS, STEP, CUT, CAP]);
ok("MAKER opens S1, Fernhill Pottery: 1 GEN, 900 s for the maker, 420 s for the client, 10% per started minute late up to 50%", open.j?.ok === true && open.j?.studio === "S1" && open.j?.fee === String(FEE) && open.j?.max_cut_bps === CAP, `${votes(open)}  ${open.msg.slice(0, 120)}`);
const sid = open.j?.studio || "S1";
const sc = await call("closeStranger", "stranger", "close_studio", [sid]);
ok("STRANGER may not close S1", refused(sc, "only the maker of " + sid + " may close it"), `${votes(sc)}  ${sc.msg.slice(0, 110)}`);
const cids = {};
for (const k of ["c1", "c2", "c3"]) {
  const r = await call("request_" + k, "client", "request_commission", [sid, BRIEF], { value: FEE, watch: ["client"], expect: { client: -FEE } });
  ok(`CLIENT commissions S1 with the mug brief: ${r.j?.commission}, 1 GEN held, no clock yet`, r.j?.ok === true && r.j?.status === "requested" && r.j?.held === String(FEE) && moved(r, "client", -FEE), `${votes(r)}  ${r.msg.slice(0, 100)}`);
  cids[k] = r.j?.commission || "";
}
const own = await call("requestOwn", "maker", "request_commission", [sid, BRIEF], { value: FEE, watch: ["maker"], expect: { maker: 0n } });
ok("MAKER may not commission its own studio, and the 1 GEN comes back in the same transaction", own.exec !== "ERROR" && own.j?.ok === false && String(own.j?.reason).includes("may not commission its own studio") && own.j?.returned === String(FEE) && moved(own, "maker", 0n), `${votes(own)}  ${own.j?.reason}`);
const sa = await call("acceptStranger", "stranger", "accept", [cids.c1]);
ok(`STRANGER may not accept ${cids.c1}`, refused(sa, "only the maker of " + cids.c1 + " may accept it"), `${votes(sa)}  ${sa.msg.slice(0, 110)}`);
const a3 = await call("accept_c3", "maker", "accept", [cids.c3]);
ok(`MAKER accepts ${cids.c3}: the clock starts with the move on the maker`, a3.j?.status === "active" && a3.j?.holder === "maker" && Number(a3.j?.since) > 0, `${votes(a3)}  ${a3.msg.slice(0, 100)}`);
const early = await call("cancelEarly", "client", "cancel_late", [cids.c3], { watch: ["client"], expect: { client: 0n } });
ok(`CLIENT may not cancel ${cids.c3} yet: the maker's cut is far from its cap`, refused(early, "the maker's cut on " + cids.c3 + " is 0 of its 5000 basis point cap") && moved(early, "client", 0n), `${votes(early)}  ${early.msg.slice(0, 140)}`);
const a2 = await call("accept_c2", "maker", "accept", [cids.c2]);
ok(`MAKER accepts ${cids.c2}`, a2.j?.status === "active" && a2.j?.holder === "maker", `${votes(a2)}`);
const d2 = await call("deliver_c2", "maker", "deliver", [cids.c2, PAGE.final, "The finished description."]);
ok(`every validator fetches mug-final.html for ${cids.c2} and agrees it is the finished piece: delivered, the move to CLIENT`, d2.j?.verdict === "delivered" && d2.j?.holder === "client" && /^[0-9a-f]{16}$/.test(String(d2.j?.fp)), `${votes(d2)}  ${JSON.stringify({ verdict: d2.j?.verdict, fp: d2.j?.fp })}`);
if (d2.j?.fp) note(`the stored fingerprint ${d2.j.fp}; this checkout's file gives ${fpOf(LOCAL.final)}`);
// The early claim is a check only while it is plainly early. The deliver round, its wait for FINALIZED and any
// resend all run on the client's clock past its grace, so read the chain's clock first and send it only with at
// least EARLY seconds to spare; otherwise say so, rather than race a claim that might succeed.
const EARLY = 240;
st.skipped = st.skipped || [];
if (!st.steps.silenceEarly && !st.skipped.includes("silenceEarly")) {
  const r2 = await read("commission", [cids.c2]);
  const left = r2 && !r2.error && r2.holder === "client" ? opensIn(r2, "client", CLIENT_SECONDS) : 0;
  if (left < EARLY) { st.skipped.push("silenceEarly"); st.views.silenceEarlyLeft = { at: stamp(), left, out: r2 }; save(); }
}
if (st.skipped.includes("silenceEarly")) {
  skip(`MAKER's early silence claim on ${cids.c2}`, `the deliver round and its wait left ${st.views.silenceEarlyLeft?.left}s before a claim could open, under the ${EARLY}s this check needs`);
} else {
  const se = await call("silenceEarly", "maker", "claim_silence", [cids.c2], { watch: ["maker"], expect: { maker: 0n } });
  ok(`MAKER may not claim silence on ${cids.c2} yet: the client has not used its 420 seconds`, refused(se, "the client has used") && refused(se, "of its 420 seconds on " + cids.c2) && moved(se, "maker", 0n), `${votes(se)}  ${se.msg.slice(0, 140)}`);
}

// ================================================================ phase B
console.log(`\n[${stamp()}] ---- phase B: the conversation on ${cids.c1}, every press judged by the validators`);
const c1 = cids.c1;
const a1 = await call("accept_c1", "maker", "accept", [c1]);
ok(`MAKER accepts ${c1}`, a1.j?.status === "active" && a1.j?.holder === "maker", `${votes(a1)}`);
const thanks = await call("sayThanks", "client", "say", [c1, THANKS]);
ok("CLIENT writes while MAKER holds the move: noted, nobody asked, the clock unchanged", thanks.j?.verdict === "noted" && thanks.j?.holder === "maker", `${votes(thanks)}  ${thanks.msg.slice(0, 100)}`);
const PRESSES = [
  ["sayGlaze", "maker", GLAZE_Q, "pass", "client", "MAKER asks which glaze to name, which the brief leaves open: pass, the move goes to CLIENT"],
  ["sayLater", "client", LATER, "keep", "client", "CLIENT: \"I'll get back to you on that.\": keep, the move stays with CLIENT"],
  ["saySeaGreen", "client", SEA_GREEN, "pass", "maker", "CLIENT: \"Sea-green, please.\": pass, the move goes back to MAKER"],
  ["sayEnglish", "maker", ENGLISH_Q, "keep", "maker", "MAKER asks whether to write in English, which the brief already says: keep"],
  ["sayUpdate", "maker", UPDATE, "keep", "maker", "MAKER: \"Working on it, nearly there.\": keep, a progress update hands nothing over"],
];
for (const [id, who, text, want, holder, title] of PRESSES) {
  const r = await call(id, who, "say", [c1, text]);
  ok(title, r.applied && r.j?.verdict === want && r.j?.holder === holder, `${votes(r)}  -> ${JSON.stringify({ verdict: r.j?.verdict, holder: r.j?.holder, maker_used: r.j?.maker_used, client_used: r.j?.client_used })}`);
}
const ph = await call("deliverPlaceholder", "maker", "deliver", [c1, PAGE.placeholder, "First draft."]);
ok("MAKER delivers mug-placeholder.html (\"Draft coming soon.\"): missing, the move stays with MAKER", ph.j?.verdict === "missing" && ph.j?.holder === "maker" && ph.j?.deliveries === 0, `${votes(ph)}  ${JSON.stringify({ verdict: ph.j?.verdict, fp: ph.j?.fp })}`);
const fin = await call("deliverFinal", "maker", "deliver", [c1, PAGE.final, "The finished description."]);
ok("MAKER delivers mug-final.html: delivered, the move goes to CLIENT for its review", fin.j?.verdict === "delivered" && fin.j?.holder === "client" && fin.j?.deliveries === 1 && fin.j?.fp === d2.j?.fp, `${votes(fin)}  ${JSON.stringify({ verdict: fin.j?.verdict, maker_used: fin.j?.maker_used, client_used: fin.j?.client_used })}`);
const acc = await call("acceptWork", "client", "accept_work", [c1], { watch: ["maker", "client"], expect: (j) => ({ maker: BigInt(j?.to_maker || 0), client: BigInt(j?.to_client || 0) }) });
ok(`CLIENT accepts the work: the split follows the maker's stored ${acc.j?.maker_used} seconds exactly`, acc.j?.status === "accepted" && splitOk(acc.j) && BigInt(acc.j?.to_maker || 0) + BigInt(acc.j?.to_client || 0) === FEE, `${votes(acc)}  ${JSON.stringify({ maker_used: acc.j?.maker_used, maker_late: acc.j?.maker_late, cut_bps: acc.j?.cut_bps, to_maker: acc.j?.to_maker, to_client: acc.j?.to_client })}`);
ok("in the same transaction MAKER receives the fee less the cut and CLIENT the cut", moved(acc, "maker", BigInt(acc.j?.to_maker || -1)) && moved(acc, "client", BigInt(acc.j?.to_client || -1)), JSON.stringify(acc.delta));

// ================================================================ phase C
console.log(`\n[${stamp()}] ---- phase C: the clocks run out`);
{
  const w2 = await untilOpen(cids.c2, "client", CLIENT_SECONDS);
  if (!st.views.c2Wait) { st.views.c2Wait = { fn: "commission", args: [cids.c2], at: stamp(), out: w2 }; save(); }
  const g2 = st.views.c2Wait.out;
  ok(`the delivery handed ${cids.c2} to CLIENT, so the first ${TURN_GRACE}s of its review were not charged`, g2.holder === "client" && Number(g2.grace) === TURN_GRACE && Number(g2.handed_by) > 0 && Number(g2.client_live) <= Math.max(0, Number(g2.now) - Number(g2.since) - TURN_GRACE), JSON.stringify({ since: g2.since, now: g2.now, grace: g2.grace, client_live: g2.client_live }));
  const sl = await call("claimSilence", "maker", "claim_silence", [cids.c2], { watch: ["maker", "client"], expect: (j) => ({ maker: BigInt(j?.to_maker || 0), client: BigInt(j?.to_client || 0) }) });
  ok(`CLIENT sat on ${cids.c2} past its 420 seconds: MAKER claims silence and it settles as accepted`, sl.j?.status === "accepted_by_silence" && Number(sl.j?.client_used) > CLIENT_SECONDS && splitOk(sl.j) && moved(sl, "maker", BigInt(sl.j?.to_maker || -1)) && moved(sl, "client", BigInt(sl.j?.to_client || -1)), `${votes(sl)}  ${JSON.stringify({ client_used: sl.j?.client_used, maker_used: sl.j?.maker_used, to_maker: sl.j?.to_maker })}`);
  await untilOpen(cids.c3, "maker", CAP_AFTER);
  const cl = await call("cancelLate", "client", "cancel_late", [cids.c3], { watch: ["client", "maker"], expect: { client: FEE, maker: 0n } });
  ok(`MAKER sat on ${cids.c3} until its cut reached the cap: CLIENT cancels and the whole 1 GEN comes back`, cl.j?.status === "cancelled_late" && cl.j?.to_client === String(FEE) && cl.j?.to_maker === "0" && Number(cl.j?.cut_bps) === CAP && moved(cl, "client", FEE) && moved(cl, "maker", 0n), `${votes(cl)}  ${JSON.stringify({ maker_used: cl.j?.maker_used, cut_bps: cl.j?.cut_bps })}`);
  const again = await call("cancelAgain", "client", "cancel_late", [cids.c3]);
  ok(`a second cancel of ${cids.c3} is refused`, refused(again, cids.c3 + " is cancelled_late; a commission is cancelled while it is active"), `${votes(again)}  ${again.msg.slice(0, 110)}`);
}

// ================================================================ phase D
console.log(`\n[${stamp()}] ---- phase D: the code read back, the views, the balances`);
{
  const file = readFileSync(new URL("../../contracts/commission_clock.py", import.meta.url));
  const chain = Buffer.from(String(await rpc("gen_getContractCode", [st.contract])), "base64");
  st.code = { address: st.contract, bytes: chain.length, sha256: sha(chain), file_bytes: file.length, file_sha256: sha(file), identical: Buffer.compare(chain, file) === 0 };
  save();
  ok(`the code deployed at ${st.contract} is byte for byte contracts/commission_clock.py`, st.code.identical, `${chain.length} bytes, sha256 ${st.code.sha256}`);
  const thread = await seen("thread", "messages_of", [c1, 0, 20]);
  const verdicts = (thread.rows || []).map((r) => r.verdict);
  ok(`messages_of(${c1}) shows the whole thread with what each message came to`, JSON.stringify(verdicts) === JSON.stringify(["noted", "pass", "keep", "pass", "keep", "keep", "missing", "delivered"]) && thread.rows?.[7]?.url === PAGE.final, JSON.stringify(verdicts));
  const row = await seen("commission", "commission", [c1]);
  ok(`commission(${c1}) reads accepted, the clock stopped and the payout stored`, row.status === "accepted" && row.holder === "" && row.held === "0" && row.maker_paid === acc.j?.to_maker && row.client_paid === acc.j?.to_client && row.last_url === PAGE.final, JSON.stringify({ status: row.status, maker_used: row.maker_used, client_used: row.client_used }));
  const s1 = await seen("studio", "studio", [sid]);
  const rec = s1.record || {};
  ok(`studio(${sid}) carries its public record: 3 commissions, 2 finished, 1 cancelled late, 5 presses, 3 deliveries`, rec.commissions === 3 && rec.on_time + rec.late === 2 && rec.cancelled_late === 1 && rec.presses === 5 && rec.passed === 2 && rec.kept === 3 && rec.deliveries === 3 && rec.delivered === 2 && rec.missing === 1, JSON.stringify(rec));
  const mine = await seen("commissionsOfClient", "commissions_of", [st.accounts.client, 0, 20]);
  ok("commissions_of(CLIENT) lists the three commissions as client, and finds the address in any letter case", mine.total === 3 && (mine.rows || []).every((r) => r.role === "client"), JSON.stringify({ total: mine.total }));
  const stats = await seen("stats", "stats", []);
  ok("stats(): nothing held, one noted message, one refused payment returned", stats.held === "0" && stats.accepted === 1 && stats.accepted_by_silence === 1 && stats.cancelled_late === 1 && stats.noted === 1 && stats.refused_payments === 1 && stats.returned === String(FEE), JSON.stringify(stats));
  const rules = await seen("rules", "rules", []);
  ok("rules() publishes the questions word for word, the comparison and the combine table", rules.press?.askings?.[0] === "1, blocks BRIEF, THREAD, MESSAGE: " + QUESTION_HAND && rules.delivery?.askings?.[0] === "1, blocks BRIEF then PAGE: " + QUESTION_THERE && String(rules.compared).includes("exact equality") && rules.press?.combine?.pass === "HAND yes in both orders and CARRY no in both orders", "");
  ok("the contract's own balance is zero", (await balance(st.contract)) === 0n, String(await balance(st.contract)));
  st.end = {}; for (const k of Object.keys(ROLES)) st.end[k] = String(await balance(acct[k].address));
  st.ended = new Date().toISOString(); save();
  const net = (k) => BigInt(st.end[k]) - BigInt(st.start[k]);
  const toMaker = BigInt(acc.j?.to_maker || 0) + BigInt(st.steps.claimSilence?.tries?.length ? (jsonOf(st.steps.claimSilence.tries.at(-1).msg)?.to_maker || 0) : 0);
  const want = { maker: toMaker, client: -toMaker, stranger: 0n };
  ok(`every account ends where the money says: MAKER up ${Number(toMaker) / 1e18} GEN, CLIENT down the same, STRANGER whole`, Object.keys(want).every((k) => net(k) === want[k]), Object.keys(want).map((k) => k.toUpperCase() + " " + Number(net(k)) / 1e18).join("  "));
}

st.checks = { pass, fail, skipped }; save();
console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ""}`);
console.log(`Commission Clock: ${st.contract}  ${EXPLORER}/address/${st.contract}`);
console.log("transactions:", st.order.reduce((n, id) => n + st.steps[id].tries.length, 0), "in", st.order.length, "steps; sent a second time:", st.order.filter((id) => st.steps[id].tries.length > 1).join(", ") || "none");
for (const id of st.order) { const s = st.steps[id]; console.log(`${id.padEnd(19)} ${s.tries.map((t) => t.tx + " " + tally(t.votes) + " " + t.exec).join(" | ")}`); }
console.log("record:", RECORD);
process.exit(fail ? 1 : 0);
