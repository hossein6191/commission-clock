// The demo maker, server side only (imported by app/api/demo/*). It holds a throwaway Studio test key
// from the DEMO_MAKER_KEY environment variable and signs exactly three kinds of call with it, on
// commissions of the demo studio whose brief is one of the four demo jobs word for word: accept() on a
// request, and say() or deliver() with one of that job's FIXED actions in lib/demo-studio.ts. The
// brief only picks the script; nothing a visitor types is ever signed. The key is never
// logged, never returned and never written anywhere; an answer names the maker's public address at
// most.

import { createAccount, createClient } from "genlayer-js";
import { getAddress, type Address } from "viem";

import { balanceOf, contractAddress, isMock, readCommission, readStudiosOf, studio } from "./chain";
import { REPO_URL, draftsCommit } from "./config";
import { cleanKey, keyProblem } from "./demo-key";
import { DEMO_LIMITS, createLimiter } from "./demo-limit";
import { DEMO_STUDIO_NAME, demoActProblem, demoActionFor, draftOf, draftUrl, isActionKey, repoOf, type DemoAction } from "./demo-studio";
import { idNumber } from "./rules";
import { FINAL_STATUSES, rpc, sleep, statusName, type RawTx } from "./rpc";
import type { DemoStatus } from "./types";

type Account = ReturnType<typeof createAccount>;
let account: { key: string; value: Account } | null = null;

/** The demo maker's account, or null when no usable key is configured. */
function demoAccount(): Account | null {
  const raw = process.env.DEMO_MAKER_KEY;
  if (keyProblem(raw)) return null;
  const key = cleanKey(raw);
  if (!account || account.key !== key) account = { key, value: createAccount(key as `0x${string}`) };
  return account.value;
}

export const NO_CONTRACT_REASON = "the contract is not deployed yet";
export const RPC_DOWN = "Studio's RPC did not answer; try again in a minute";
export const NO_BALANCE = "the demo maker's account holds no GEN and Studio's faucet did not top it up";
export const NOT_OPEN = "the demo studio is not open on this contract yet (tools/open-demo-studio.mjs opens it)";
export const NO_COMMIT = "the demo drafts are not pinned to a commit yet (DRAFTS_COMMIT in lib/config.ts, or NEXT_PUBLIC_DRAFTS_COMMIT)";
export const NO_REPO = "the site does not know its public repository (NEXT_PUBLIC_REPO_URL), so it cannot build the drafts' addresses";

/** Whether the demo maker can deliver: the drafts' pinned addresses can be built. */
export function draftsState(): { drafts: boolean; draftsReason: string } {
  if (!draftsCommit()) return { drafts: false, draftsReason: NO_COMMIT };
  if (!repoOf(REPO_URL)) return { drafts: false, draftsReason: NO_REPO };
  return { drafts: true, draftsReason: "" };
}

// The demo studio's id is read once and kept for five minutes: it never changes for one contract.
let found: { contract: string; maker: string; studio: string; at: number } | null = null;

/** The newest studio this key opened under the demo name, or "" when it has none. */
async function demoStudioId(maker: string): Promise<string> {
  const contract = contractAddress().toLowerCase();
  if (found && found.contract === contract && found.maker === maker && Date.now() - found.at < 300_000) return found.studio;
  const rows = (await readStudiosOf(maker, 0, 20, { fresh: true })).data.rows;
  const mine = rows.filter((r) => r.name === DEMO_STUDIO_NAME).sort((a, b) => idNumber(b.id) - idNumber(a.id));
  const id = mine[0]?.id ?? "";
  if (id) found = { contract, maker, studio: id, at: Date.now() };
  return id;
}

/** The demo key signs from its own balance; Studio's faucet refills it when it holds less than a GEN. */
async function ensureBalance(maker: string): Promise<boolean> {
  const have = await balanceOf(maker);
  if (have >= 10n ** 18n) return true;
  try {
    await rpc("sim_fundAccount", { account_address: getAddress(maker), amount: 20e18 });
  } catch {
    return have > 0n;
  }
  for (let i = 0; i < 6; i++) {
    await sleep(2000);
    try {
      if ((await balanceOf(maker)) > have) return true;
    } catch {
      /* one dropped read; ask again */
    }
  }
  return have > 0n;
}

/** Whether the demo maker can act now, and exactly why not. */
export async function demoStatusNow(): Promise<DemoStatus> {
  const drafts = draftsState();
  if (isMock) return { online: false, maker: "", studio: "", reason: "in the demo build the demo maker answers in the browser", ...drafts };
  const problem = keyProblem(process.env.DEMO_MAKER_KEY);
  if (problem) return { online: false, maker: "", studio: "", reason: problem, ...drafts };
  const maker = demoAccount()!.address.toLowerCase();
  if (!contractAddress()) return { online: false, maker, studio: "", reason: NO_CONTRACT_REASON, ...drafts };
  let funded = false;
  try {
    funded = await ensureBalance(maker);
  } catch {
    return { online: false, maker, studio: "", reason: RPC_DOWN, ...drafts };
  }
  if (!funded) return { online: false, maker, studio: "", reason: NO_BALANCE, ...drafts };
  let id = "";
  try {
    id = await demoStudioId(maker);
  } catch {
    return { online: false, maker, studio: "", reason: RPC_DOWN, ...drafts };
  }
  if (!id) return { online: false, maker, studio: "", reason: NOT_OPEN, ...drafts };
  return { online: true, maker, studio: id, reason: "", ...drafts };
}

const limiter = createLimiter(DEMO_LIMITS);

// One move at a time per commission: the hash of the last one, until it is final.
const inflight = new Map<string, { hash: string; at: number }>();

/** True while the demo maker's last move on `commission` is still going through. */
async function stillMoving(commission: string): Promise<boolean> {
  const last = inflight.get(commission);
  if (!last) return false;
  if (Date.now() - last.at > DEMO_LIMITS.sentHoldMs) {
    inflight.delete(commission);
    return false;
  }
  try {
    const tx = await rpc<RawTx | null>("eth_getTransactionByHash", [last.hash]);
    if (tx && FINAL_STATUSES.has(statusName(tx.status))) {
      inflight.delete(commission);
      return false;
    }
  } catch {
    /* not readable now: still moving, as far as anyone can tell */
  }
  return true;
}

// One signature at a time: two moves signed at once would ask for the same nonce.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

export type ServerAnswer = { status: number; body: { ok: true; hash: string } | { ok: false; reason: string; retryAfter?: number } };

/**
 * The demo maker accepts a request (`"accept"`) or does one action of its fixed script, on a commission
 * of the demo studio: the script is the job whose brief the commission carries, word for word.
 */
export async function sendDemo(commission: string, what: "accept" | string): Promise<ServerAnswer> {
  if (what !== "accept" && !isActionKey(what)) return { status: 400, body: { ok: false, reason: "the demo maker does only what its buttons say" } };
  const s = await demoStatusNow();
  if (!s.online) return { status: 503, body: { ok: false, reason: "the demo maker is offline: " + s.reason } };
  const turn = limiter.attempt(commission, Date.now());
  if (!turn.ok) return { status: 429, body: { ok: false, reason: `the demo maker was asked about ${commission} a moment ago; try again in ${turn.retryAfter} s`, retryAfter: turn.retryAfter } };
  if (await stillMoving(commission)) return { status: 409, body: { ok: false, reason: `the demo maker is still waiting for its last move on ${commission} to be final; try again once it is` } };
  let row;
  try {
    row = (await readCommission(commission, { fresh: true })).data;
  } catch {
    return { status: 502, body: { ok: false, reason: "could not read the commission from Studio; try again in a minute" } };
  }
  const problem = demoActProblem(row ? { id: row.id, studio: row.studio, status: row.status, brief: row.brief } : null, s.studio, what, s.drafts);
  if (problem) return { status: row ? 409 : 404, body: { ok: false, reason: problem } };
  // The brief picks which job's fixed move this key names; the move's own words are what is signed.
  const action: "accept" | DemoAction = what === "accept" ? "accept" : demoActionFor(row!.brief, what)!;
  const a = demoAccount()!;
  const call =
    action === "accept"
      ? { functionName: "accept", args: [commission] }
      : action.kind === "say"
        ? { functionName: "say", args: [commission, action.text] }
        : { functionName: "deliver", args: [commission, draftUrl(repoOf(REPO_URL), draftsCommit(), draftOf(action.draft!, action.job).file), action.text] };
  try {
    const hash = await serial(async () => {
      const client = createClient({ chain: studio, account: a });
      return client.writeContract({ address: contractAddress() as Address, functionName: call.functionName, args: call.args, value: 0n });
    });
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("no hash");
    inflight.set(commission, { hash, at: Date.now() });
    return { status: 200, body: { ok: true, hash } };
  } catch {
    // Nothing of the error goes out: it is the network's, and it is not the visitor's business.
    return { status: 502, body: { ok: false, reason: "Studio did not take the demo maker's move; try again in a minute" } };
  }
}
