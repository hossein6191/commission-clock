// Opens the demo studio (lib/demo-studio.ts) from its key, once: Fernhill Pottery copy desk on the demo
// terms (0.5 GEN; 20 minutes for the maker, 10 for the client; 10% of the fee per started 2 minutes
// late, at most 50%). Run it by hand after the contract is deployed; nothing in the build runs it.
//
//   REGISTER=0x... DEMO_MAKER_KEY=0x... node tools/open-demo-studio.mjs
//   DRY=1 REGISTER=0x... node tools/open-demo-studio.mjs                  # print the call, send nothing
//   COMMIT=<40 hex> REPO=<owner>/<name> ...                               # also check the drafts are at that commit
//
// The key is a throwaway Studio test key, the same one the site's server holds in DEMO_MAKER_KEY; it is
// read from the environment only and never printed. If this key already opened a studio under the demo
// name, that studio is kept and nothing is sent. When COMMIT is given, every draft the demo maker will
// deliver is fetched from raw.githubusercontent.com and compared with drafts/ in this checkout, so a
// wrong commit is caught before anyone relies on it (DRAFTS_COMMIT in lib/config.ts takes the same
// commit). Each transaction is followed to a final status. Needs Node 22.18 or later (it reads lib/*.ts
// directly).

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress } from "viem";

import { REPO_URL } from "../lib/config.ts";
import { cleanKey, keyProblem } from "../lib/demo-key.ts";
import { DEMO_ABOUT, DEMO_STUDIO_NAME, DEMO_TERMS, DRAFTS, draftUrl, repoOf } from "../lib/demo-studio.ts";
import { aboutProblem, nameProblem, termsOfProblem } from "../lib/rules.ts";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const studio = { ...studionet, rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC] } } };

const REGISTER = (process.env.REGISTER || "").trim();
const COMMIT = (process.env.COMMIT || "").trim();
const DRY = process.env.DRY === "1";
function remoteRepo() {
  try {
    const origin = execSync("git remote get-url origin", { cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return (origin.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/) || [])[1] || "";
  } catch {
    return "";
  }
}
const REPO = (process.env.REPO || repoOf(REPO_URL) || remoteRepo()).trim();

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
if (!/^0x[0-9a-fA-F]{40}$/.test(REGISTER)) fail("REGISTER must be the deployed contract's 0x address.");
if (COMMIT && !/^[0-9a-f]{40}$/.test(COMMIT)) fail("COMMIT, when given, must be the 40-character commit the drafts were pushed in.");
const problem = keyProblem(process.env.DEMO_MAKER_KEY);
if (!DRY && problem) fail(`DEMO_MAKER_KEY: ${problem}.`);
const why = nameProblem(DEMO_STUDIO_NAME) || aboutProblem(DEMO_ABOUT) || termsOfProblem(DEMO_TERMS);
if (why) fail(`The demo studio would be refused: ${why}.`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = [DEMO_STUDIO_NAME, DEMO_ABOUT, DEMO_TERMS.feeAtto.toString(), DEMO_TERMS.makerSeconds, DEMO_TERMS.clientSeconds, DEMO_TERMS.stepSeconds, DEMO_TERMS.cutBps, DEMO_TERMS.maxCutBps];

// ---- the drafts the demo maker will deliver must be at that commit -------------------------------------
if (COMMIT) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(REPO)) fail("REPO must be <owner>/<name> on GitHub (or set the git remote origin) when COMMIT is given.");
  for (const d of DRAFTS) {
    const here = readFileSync(new URL(`../../drafts/${d.file}`, import.meta.url), "utf8");
    let there = "";
    try {
      const r = await fetch(draftUrl(REPO, COMMIT, d.file));
      there = r.ok ? await r.text() : "";
    } catch {
      there = "";
    }
    if (there !== here) fail(`${draftUrl(REPO, COMMIT, d.file)}\ndoes not serve drafts/${d.file} as it is in this checkout. Push the repository and pass that commit as COMMIT.`);
  }
  console.log(`the ${DRAFTS.length} drafts are at ${draftUrl(REPO, COMMIT, "")}; set DRAFTS_COMMIT = "${COMMIT}" in lib/config.ts`);
} else console.log("COMMIT not given: the drafts were not checked. The demo maker delivers only once DRAFTS_COMMIT is set in lib/config.ts.");

console.log(`${DRY ? "DRY RUN: " : ""}${DEMO_STUDIO_NAME} to ${REGISTER}`);
if (DRY) {
  console.log(`open_studio(${args.map((a) => JSON.stringify(a)).join(", ")})`);
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

const account = createAccount(cleanKey(process.env.DEMO_MAKER_KEY));
const maker = account.address.toLowerCase();
console.log(`demo maker ${account.address}`);
const client = createClient({ chain: studio, account });

// The key signs from its own balance; Studio's faucet tops it up when it holds less than a GEN.
const have = BigInt((await rpc("eth_getBalance", [account.address, "latest"])) || "0x0");
if (have < 10n ** 18n) {
  await rpc("sim_fundAccount", { account_address: getAddress(account.address), amount: 20e18 });
  for (let i = 0; i < 20 && BigInt((await rpc("eth_getBalance", [account.address, "latest"])) || "0x0") <= have; i++) await sleep(3000);
}

const mine = await read(client, "studios_of", [maker, 0, 20]);
const existing = (mine.rows ?? []).filter((r) => r.name === DEMO_STUDIO_NAME).map((r) => r.studio).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))[0] ?? "";
if (existing) {
  console.log(`SKIP  open_studio: this key already runs ${existing}. The site's server finds it by the key's address.`);
  process.exit(0);
}
let sent = null;
for (let tries = 1; !sent; tries++) {
  try {
    const hash = await client.writeContract({ address: REGISTER, functionName: "open_studio", args, value: 0n });
    sent = { ...(await follow(hash)), hash };
  } catch (e) {
    if (tries >= 3) fail(`open_studio not sent (${String(e?.shortMessage || e?.message || e).slice(0, 80)})`);
    await sleep(15_000);
  }
}
const id = sent.json?.ok === true ? sent.json.studio : "";
console.log(`${id ? "OK  " : "FAIL"}  open_studio: ${id || sent.status + " " + sent.exec + " " + sent.text.slice(0, 160)}  ${sent.agree}/${sent.of} agree  ${EXPLORER}/tx/${sent.hash}`);
if (!id) process.exit(1);
console.log(`\nThe demo studio is ${id}. The site's server finds it by the key's address; set DEMO_MAKER_KEY on the host and check GET /api/demo/status.`);
