// Opens the two demo studios of contract version 2 (lib/demo-studio.ts) from the demo maker's key, once
// each: Fernhill Pottery copy desk on the demo terms (one stage, the four demo jobs), and Fernhill
// Pottery, in stages (the mug job paid Outline 20%, First draft 30%, Final 50%). Run it by hand after a
// version 2 register is deployed; nothing in the build runs it.
//
//   node tools/open-demo-v2.mjs <key.json> [0xREGISTER]       # REGISTER defaults to DEMO_CONTRACT in lib/config.ts
//   DRY=1 node tools/open-demo-v2.mjs <key.json> [0xREGISTER] # print the calls, send nothing
//   COMMIT=<40 hex> REPO=<owner>/<name> ...                    # also check the drafts are at that commit
//
// The key file is JSON: a "0x..." string, or an object holding it as privateKey, private_key, key or
// DEMO_MAKER_KEY (or keys.maker). It is the throwaway Studio test key the site's server holds in
// DEMO_MAKER_KEY. It is read from that file only and never printed: only its public address is. A studio
// this key already opened under a demo name is kept and nothing is sent for it. Each transaction is
// followed to a final status. Needs Node 22.18 or later (it reads lib/*.ts directly).

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress } from "viem";

import { DEMO_CONTRACT, REPO_URL } from "../lib/config.ts";
import { cleanKey, keyProblem } from "../lib/demo-key.ts";
import { ALL_DRAFT_FILES, DEMO_ABOUT, DEMO_STAGES, DEMO_STUDIO_NAME, DEMO_TERMS, STAGED_ABOUT, STAGED_STUDIO_NAME, STAGED_TERMS, draftUrl, repoOf } from "../lib/demo-studio.ts";
import { aboutProblem, nameProblem, stagesOf, termsOfProblem } from "../lib/rules.ts";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const studio = { ...studionet, rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC] } } };

const fail = (message) => {
  console.error(message);
  process.exit(2);
};

const KEY_FILE = (process.argv[2] || "").trim();
const REGISTER = (process.argv[3] || process.env.REGISTER || DEMO_CONTRACT || "").trim();
const COMMIT = (process.env.COMMIT || "").trim();
const DRY = process.env.DRY === "1";
if (!KEY_FILE) fail("Usage: node tools/open-demo-v2.mjs <key.json> [0xREGISTER]");
if (!/^0x[0-9a-fA-F]{40}$/.test(REGISTER)) fail("The register must be the deployed version 2 contract's 0x address.");
if (COMMIT && !/^[0-9a-f]{40}$/.test(COMMIT)) fail("COMMIT, when given, must be the 40-character commit the drafts were pushed in.");

/** The key from the file, whatever of the usual shapes it has; the key itself never reaches the console. */
function keyFrom(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("The key file could not be read as JSON.");
  }
  const pick = (o) => (typeof o === "string" ? o : o && typeof o === "object" ? o.privateKey ?? o.private_key ?? o.key ?? o.DEMO_MAKER_KEY ?? pick(o.keys?.maker) : undefined);
  const key = pick(raw);
  const problem = keyProblem(typeof key === "string" ? key : undefined);
  if (problem) fail(`The key in the file: ${problem}.`);
  return cleanKey(key);
}
const KEY = keyFrom(KEY_FILE);

const STUDIOS = [
  { name: DEMO_STUDIO_NAME, about: DEMO_ABOUT, terms: DEMO_TERMS, stages: "" },
  { name: STAGED_STUDIO_NAME, about: STAGED_ABOUT, terms: STAGED_TERMS, stages: DEMO_STAGES },
];
for (const s of STUDIOS) {
  const why = nameProblem(s.name) || aboutProblem(s.about) || termsOfProblem(s.terms) || stagesOf(s.stages).problem;
  if (why) fail(`${s.name} would be refused: ${why}.`);
}
const argsOf = (s) => [s.name, s.about, s.terms.feeAtto.toString(), s.terms.makerSeconds, s.terms.clientSeconds, s.terms.stepSeconds, s.terms.cutBps, s.terms.maxCutBps, s.stages];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function remoteRepo() {
  try {
    const origin = execSync("git remote get-url origin", { cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return (origin.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/) || [])[1] || "";
  } catch {
    return "";
  }
}
const REPO = (process.env.REPO || repoOf(REPO_URL) || remoteRepo()).trim();

// ---- the drafts the demo maker will deliver must be at that commit -------------------------------------
if (COMMIT) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(REPO)) fail("REPO must be <owner>/<name> on GitHub (or set the git remote origin) when COMMIT is given.");
  for (const file of ALL_DRAFT_FILES) {
    const here = readFileSync(new URL(`../../drafts/${file}`, import.meta.url), "utf8");
    let there = "";
    try {
      const r = await fetch(draftUrl(REPO, COMMIT, file));
      there = r.ok ? await r.text() : "";
    } catch {
      there = "";
    }
    if (there !== here) fail(`${draftUrl(REPO, COMMIT, file)}\ndoes not serve drafts/${file} as it is in this checkout. Push the repository and pass that commit as COMMIT.`);
  }
  console.log(`the ${ALL_DRAFT_FILES.length} drafts are at ${draftUrl(REPO, COMMIT, "")}; set DRAFTS_COMMIT = "${COMMIT}" in lib/config.ts`);
} else console.log("COMMIT not given: the drafts were not checked. The demo maker delivers only once DRAFTS_COMMIT is set in lib/config.ts.");

const account = createAccount(KEY);
const maker = account.address.toLowerCase();
console.log(`${DRY ? "DRY RUN: " : ""}demo maker ${account.address} on ${REGISTER}`);
if (DRY) {
  for (const s of STUDIOS) console.log(`open_studio(${argsOf(s).map((a) => JSON.stringify(a)).join(", ")})`);
  process.exit(0);
}

async function rpc(method, params) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const body = await res.json();
      if (body.error) {
        await sleep(res.status === 429 || body.error.code === -32029 ? 20_000 : 5000);
        continue;
      }
      return body.result;
    } catch {
      await sleep(4000);
    }
  }
  throw new Error(`${method} did not answer`);
}

/** Follows a transaction to a final status; returns the contract's JSON return and the vote tally. */
async function follow(hash) {
  for (let i = 0; i < 300; i++) {
    await sleep(4000);
    const tx = await rpc("eth_getTransactionByHash", [hash]);
    const status = String(tx?.status ?? "");
    if (status === "FINALIZED" || status === "CANCELED" || status === "UNDETERMINED") {
      const lr = tx.consensus_data?.leader_receipt;
      const one = Array.isArray(lr) ? lr[0] : lr;
      let text = "";
      try {
        text = Buffer.from(one?.result ?? "", "base64").toString("utf8");
      } catch {
        text = "";
      }
      const start = text.indexOf("{");
      let json = null;
      try {
        json = start >= 0 ? JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) : null;
      } catch {
        json = null;
      }
      const votes = Object.values(tx.consensus_data?.votes ?? {});
      return { status, json, agree: votes.filter((v) => v === "agree").length, of: votes.length, exec: one?.execution_result ?? "", text };
    }
  }
  return { status: "TIMEOUT", json: null, agree: 0, of: 0, exec: "", text: "" };
}

async function read(client, functionName, fnArgs) {
  for (let i = 0; i < 8; i++) {
    try {
      const raw = await client.readContract({ address: REGISTER, functionName, args: fnArgs });
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      await sleep(5000);
    }
  }
  throw new Error(`could not read ${functionName}() from Studio`);
}

const client = createClient({ chain: studio, account });

// The key signs from its own balance; Studio's faucet tops it up when it holds less than a GEN.
const have = BigInt((await rpc("eth_getBalance", [account.address, "latest"])) || "0x0");
if (have < 10n ** 18n) {
  await rpc("sim_fundAccount", { account_address: getAddress(account.address), amount: 20e18 });
  for (let i = 0; i < 20 && BigInt((await rpc("eth_getBalance", [account.address, "latest"])) || "0x0") <= have; i++) await sleep(3000);
}

const mine = await read(client, "studios_of", [maker, 0, 20]);
const ids = {};
for (const s of STUDIOS) {
  const existing = (mine.rows ?? []).filter((r) => r.name === s.name).map((r) => r.studio).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))[0] ?? "";
  if (existing) {
    ids[s.name] = existing;
    console.log(`SKIP  open_studio ${s.name}: this key already runs ${existing}.`);
    continue;
  }
  let sent = null;
  for (let tries = 1; !sent; tries++) {
    try {
      const hash = await client.writeContract({ address: REGISTER, functionName: "open_studio", args: argsOf(s), value: 0n });
      sent = { ...(await follow(hash)), hash };
    } catch (e) {
      if (tries >= 3) fail(`open_studio ${s.name} not sent (${String(e?.shortMessage || e?.message || e).slice(0, 80)})`);
      await sleep(15_000);
    }
  }
  const id = sent.json?.ok === true ? sent.json.studio : "";
  console.log(`${id ? "OK  " : "FAIL"}  open_studio ${s.name}: ${id || sent.status + " " + sent.exec + " " + sent.text.slice(0, 160)}  ${sent.agree}/${sent.of} agree  ${EXPLORER}/tx/${sent.hash}`);
  if (!id) process.exit(1);
  ids[s.name] = id;
}
console.log(`\nThe demo studios are ${ids[DEMO_STUDIO_NAME]} (one stage) and ${ids[STAGED_STUDIO_NAME]} (three stages). The site's server finds both by the key's address; set DEMO_MAKER_KEY on the host and check GET /api/demo/status.`);
