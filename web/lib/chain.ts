// Chain access for Commission Clock: the ONE file that knows the contract's interface.
//
// Every method name, argument order, view shape and outcome word of contracts/commission_clock.py that
// the site depends on is written here and nowhere else. Pages import typed reads, typed call builders
// and mapped outcomes from this module; when the contract's interface changes, this is the file to
// edit, with lib/chain-mock.ts, which stands in for the contract in mock mode and answers in the
// contract's own JSON so the mappers below run in both modes.
//
// Reads go through readContract (gen_call) with the retry policy in lib/rpc.ts: eight tries over
// about forty seconds, because Studio answers "Contract not found" for a healthy contract for about a
// minute after a deploy. A failed read is never "no data" and never proof that a write failed. Studio
// allows 30 gen_call a minute from one browser (the faucet shares them), so every view answer is
// cached for 30 s, two components asking for the same view share one request, and invalidateReads()
// drops the cache once a transaction is final. Every view here takes a short id, two small numbers or
// one address.

import * as mock from "./chain-mock";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress, type Address } from "viem";
import { notify } from "./browser-store";
import { contractAddress, demoStudioFallback } from "./config";
import { RATE_LIMITED, createReadCache, decodeTx, isMissingMethodError, noteFailure, rpc, sleep, waitForCooldown, withRetry, type RawTx } from "./rpc";
import { MESSAGE_KINDS, MESSAGE_VERDICTS, PAGE, STATUSES, idNumber, sentence, type CommissionStatus, type Holder, type MessageKind, type MessageVerdict, type Side } from "./rules";
import type { Arg, Call, Commission, DemoAnswer, DemoStatus, Message, Paged, ReadResult, Rules, Stats, Studio, StudioRecord, TxStatus, WriteFn } from "./types";
import { chainName, getChainId, getSigner } from "./wallet";

export { RATE_LIMITED, cooldownRemainingMs } from "./rpc";
export { contractAddress };

export const CHAIN_ID = 61999;
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";

export const NETWORK_ERROR = "could not reach the network";
/** Thrown by reads while the site has no contract address. */
export const NO_CONTRACT = "the contract is not deployed yet";
/** What the faucet says when Studio refused sim_fundAccount three times. */
export const FAUCET_REFUSED = "Studio refused the faucet request (it allows 30 requests a minute from one browser). Try again in a minute.";

/** True when this site has a contract to read: always in mock mode. */
export const hasContract = (): boolean => isMock || !!contractAddress();

/** The contract the explorer links point at. */
export const contractInUse = (): string => (isMock ? mock.MOCK_CONTRACT : contractAddress());

// ---- low-level view access ------------------------------------------------------------------------

// The SDK's studionet object carries another explorer URL; the RPC and explorer hosts are set here.
export const studio = {
  ...studionet,
  rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GenLayer Studio Explorer", url: EXPLORER_URL } },
};

const reader = () => createClient({ chain: studio });

type Row = Record<string, unknown>;

const num = (v: unknown, dflt = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : dflt;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v);
  return dflt;
};
const str = (v: unknown, dflt = ""): string => (v === undefined || v === null ? dflt : String(v));
const atto = (v: unknown): string => {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? BigInt(Math.trunc(v)).toString() : "0";
  const s = str(v, "0").trim();
  return /^\d+$/.test(s) ? s : "0";
};
const addr = (v: unknown): string => str(v).toLowerCase();
/** Seconds; the contract writes -1 or 0 when a call had no readable clock. */
const secs = (v: unknown): number => Math.max(0, num(v));
const asRow = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === "object" && !Array.isArray(r)) : []);

/** A view returns a JSON string; parse it. Some decoders already hand back the object. */
function parseView(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/** How long a view answer is reused. */
export const READ_TTL_MS = 30_000;
const onServer = typeof window === "undefined";
const views = createReadCache<unknown>(onServer ? 0 : READ_TTL_MS);

let moved = 0;
/** How many times the chain has moved under this page (a final transaction, a faucet payment): a stable snapshot. */
export const chainVersion = (): number => moved;

/** Forget every cached view answer, and tell the lists on screen to read again. Called once a transaction is final or the faucet paid. */
export const invalidateReads = () => {
  views.clear();
  moved++;
  notify();
};

/**
 * One view call through the cache. Throws RATE_LIMITED when Studio is rate-limiting this browser,
 * NO_CONTRACT when no contract is set, and the plain network error when Studio never answered.
 */
async function view(fn: string, args: Arg[] = [], opts: { fresh?: boolean } = {}): Promise<unknown> {
  if (isMock) return parseView(await mock.view(fn, args));
  const address = contractAddress();
  if (!address) throw new Error(NO_CONTRACT);
  const key = `${address.toLowerCase()}|${fn}|${JSON.stringify(args)}`;
  if (opts.fresh) views.forget(key);
  try {
    const raw = await views.get(key, () =>
      withRetry(() => reader().readContract({ address: address as Address, functionName: fn, args }), {
        bucket: "gen",
        giveUp: isMissingMethodError,
      }),
    );
    return parseView(raw);
  } catch (e) {
    if (e instanceof Error && e.message === RATE_LIMITED) throw e;
    throw new Error(NETWORK_ERROR);
  }
}

/** The clock a page ticks with when a row is read: the mock's in mock mode, else the browser's. */
const browserNow = (): number => (isMock ? mock.mockNow() : Math.floor(Date.now() / 1000));

const SOURCE: ReadResult<unknown>["source"] = isMock ? "mock" : "chain";
const result = <T>(data: T): ReadResult<T> => ({ data, source: SOURCE });

// ---- row mappers (every missing field gets a default) -----------------------------------------------

const status = (v: unknown): CommissionStatus => (STATUSES.includes(str(v) as CommissionStatus) ? (str(v) as CommissionStatus) : "requested");
const holder = (v: unknown): Holder => (str(v) === "maker" ? "maker" : str(v) === "client" ? "client" : "");
const side = (v: unknown): Side => (str(v) === "client" ? "client" : "maker");
const verdict = (v: unknown): MessageVerdict => (MESSAGE_VERDICTS.includes(str(v) as MessageVerdict) ? (str(v) as MessageVerdict) : "unclear");
const kind = (v: unknown): MessageKind => (MESSAGE_KINDS.includes(str(v) as MessageKind) ? (str(v) as MessageKind) : "say");
const fp = (v: unknown): string => (/^[0-9a-f]{16}$/.test(str(v)) ? str(v) : "");

export function mapRecord(r: Row): StudioRecord {
  return {
    commissions: num(r.commissions),
    onTime: num(r.on_time),
    late: num(r.late),
    cancelledLate: num(r.cancelled_late),
    lapsed: num(r.lapsed),
    declined: num(r.declined),
    withdrawn: num(r.withdrawn),
    presses: num(r.presses),
    passed: num(r.passed),
    kept: num(r.kept),
    unclear: num(r.unclear),
    deliveries: num(r.deliveries),
    delivered: num(r.delivered),
    missing: num(r.missing),
    lateSeconds: num(r.late_seconds),
  };
}

export function mapStudio(r: Row, id = ""): Studio {
  return {
    id: str(r.studio ?? id),
    maker: addr(r.maker),
    name: str(r.name),
    about: str(r.about),
    feeAtto: atto(r.fee),
    makerSeconds: num(r.maker_seconds),
    clientSeconds: num(r.client_seconds),
    stepSeconds: num(r.step_seconds, 60),
    cutBps: num(r.cut_bps, 1),
    maxCutBps: num(r.max_cut_bps, 100),
    killBps: num(r.kill_bps),
    accepting: r.accepting === true,
    openedAt: secs(r.opened_at),
    record: mapRecord(asRow(r.record)),
  };
}

export function mapCommission(r: Row, id = ""): Commission {
  const role = str(r.role);
  return {
    id: str(r.commission ?? id),
    studio: str(r.studio),
    studioName: str(r.studio_name),
    maker: addr(r.maker),
    client: addr(r.client),
    brief: str(r.brief),
    feeAtto: atto(r.fee),
    status: status(r.status),
    holder: holder(r.holder),
    since: secs(r.since),
    handedBy: num(r.handed_by),
    grace: num(r.grace),
    makerUsed: num(r.maker_used),
    clientUsed: num(r.client_used),
    makerSeconds: num(r.maker_seconds),
    clientSeconds: num(r.client_seconds),
    stepSeconds: num(r.step_seconds, 60),
    cutBps: num(r.cut_bps, 1),
    maxCutBps: num(r.max_cut_bps, 100),
    capAfter: num(r.cap_after),
    killBps: num(r.kill_bps),
    requestedAt: secs(r.requested_at),
    acceptedAt: secs(r.accepted_at),
    settledAt: secs(r.settled_at),
    messages: num(r.messages),
    deliveries: num(r.deliveries),
    lastUrl: str(r.last_url),
    lastFp: fp(r.last_fp),
    lastDeliveredAt: secs(r.last_delivered_at),
    makerLate: num(r.maker_late),
    cutBpsTotal: num(r.cut_bps_total),
    makerPaidAtto: atto(r.maker_paid),
    clientPaidAtto: atto(r.client_paid),
    heldAtto: atto(r.held),
    now: secs(r.now),
    readAt: 0,
    makerLive: num(r.maker_live, -1),
    clientLive: num(r.client_live, -1),
    role: role === "maker" || role === "client" ? role : undefined,
  };
}

export function mapMessage(r: Row): Message {
  return {
    id: str(r.message),
    n: num(r.n),
    role: side(r.role),
    kind: kind(r.kind),
    text: str(r.text),
    url: str(r.url),
    verdict: verdict(r.verdict),
    fp: fp(r.fp),
    at: secs(r.at),
  };
}

export function mapStats(r: Row): Stats {
  return {
    studios: num(r.studios),
    commissions: num(r.commissions),
    waiting: num(r.waiting),
    active: num(r.active),
    accepted: num(r.accepted),
    acceptedBySilence: num(r.accepted_by_silence),
    lapsed: num(r.lapsed),
    cancelledLate: num(r.cancelled_late),
    withdrawn: num(r.withdrawn),
    declined: num(r.declined),
    presses: num(r.presses),
    passed: num(r.passed),
    kept: num(r.kept),
    unclear: num(r.unclear),
    noted: num(r.noted),
    takes: num(r.takes),
    deliveries: num(r.deliveries),
    delivered: num(r.delivered),
    missing: num(r.missing),
    deliveryUnclear: num(r.delivery_unclear),
    heldAtto: atto(r.held),
    takenAtto: atto(r.taken),
    toMakersAtto: atto(r.to_makers),
    toClientsAtto: atto(r.to_clients),
    refusedPayments: num(r.refused_payments),
    returnedAtto: atto(r.returned),
  };
}

const paged = <T>(value: Row, map: (r: Row) => T): Paged<T> => {
  if (!Array.isArray(value.rows)) throw new Error(NETWORK_ERROR);
  return { total: num(value.total), offset: num(value.offset), limit: num(value.limit, PAGE), rows: rowsOf(value.rows).map(map) };
};

// ---- reads: one function per view ---------------------------------------------------------------------

type Fresh = { fresh?: boolean };
const pageArgs = (offset: number, limit: number): [number, number] => [Math.max(0, Math.trunc(offset)), Math.max(1, Math.min(PAGE, Math.trunc(limit)))];

/** studio(id): null when the contract holds no such studio. */
export async function readStudio(id: string, opts: Fresh = {}): Promise<ReadResult<Studio | null>> {
  const value = asRow(await view("studio", [id], opts));
  if ("error" in value || !value.maker) return result(null);
  return result(mapStudio(value, id));
}

/** studios(offset, limit): one page of every studio, oldest first. */
export async function readStudios(offset = 0, limit = PAGE, opts: Fresh = {}): Promise<ReadResult<Paged<Studio>>> {
  return result(paged(asRow(await view("studios", pageArgs(offset, limit), opts)), (r) => mapStudio(r)));
}

/** studios_of(address, offset, limit): one page of the studios an address opened. */
export async function readStudiosOf(address: string, offset = 0, limit = PAGE, opts: Fresh = {}): Promise<ReadResult<Paged<Studio>>> {
  return result(paged(asRow(await view("studios_of", [address.toLowerCase(), ...pageArgs(offset, limit)], opts)), (r) => mapStudio(r)));
}

/** commission(id): null when there is no such commission. Its row carries the view's own clock. */
export async function readCommission(id: string, opts: Fresh = {}): Promise<ReadResult<Commission | null>> {
  const value = asRow(await view("commission", [id], opts));
  if ("error" in value || !value.client) return result(null);
  return result({ ...mapCommission(value, id), readAt: browserNow() });
}

/** messages_of(commission, offset, limit): one page of a thread, oldest first. */
export async function readMessages(id: string, offset = 0, limit = PAGE, opts: Fresh = {}): Promise<ReadResult<Paged<Message>>> {
  const value = asRow(await view("messages_of", [id, ...pageArgs(offset, limit)], opts));
  if ("error" in value) return result({ total: 0, offset: 0, limit: PAGE, rows: [] });
  return result(paged(value, mapMessage));
}

/** The newest messages of a thread: its last PAGE rows, in one read. Earlier pages are read with readMessages. */
export async function readThreadTail(id: string, total: number, opts: Fresh = {}): Promise<ReadResult<{ total: number; rows: Message[] }>> {
  if (total <= 0) return result({ total: 0, rows: [] });
  const start = Math.max(0, total - PAGE);
  const last = (await readMessages(id, start, PAGE, opts)).data;
  return result({ total: last.total, rows: last.rows });
}

/** commissions_of(address, offset, limit): one page of the commissions an address is a party to. */
export async function readCommissionsOf(address: string, offset = 0, limit = PAGE, opts: Fresh = {}): Promise<ReadResult<Paged<Commission>>> {
  return result(paged(asRow(await view("commissions_of", [address.toLowerCase(), ...pageArgs(offset, limit)], opts)), (r) => mapCommission(r)));
}

/** studio_commissions(studio, offset, limit): one page of a studio's commissions. */
export async function readStudioCommissions(studioId: string, offset = 0, limit = PAGE, opts: Fresh = {}): Promise<ReadResult<Paged<Commission>>> {
  return result(paged(asRow(await view("studio_commissions", [studioId, ...pageArgs(offset, limit)], opts)), (r) => mapCommission(r)));
}

/** The newest rows of a paged list first: the first page says how many there are, then the newest pages down to `maxPages`. */
async function newestFirst<T extends { id: string }>(read: (offset: number) => Promise<Paged<T>>, maxPages: number): Promise<{ total: number; rows: T[]; partial: boolean }> {
  const first = await read(0);
  const pages = Math.ceil(first.total / PAGE);
  const rows = [...first.rows];
  for (let p = pages - 1, k = 1; p >= 1 && k < maxPages; p--, k++) rows.push(...(await read(p * PAGE)).rows);
  const unique = new Map(rows.map((r) => [r.id, r]));
  return { total: first.total, rows: [...unique.values()].sort((a, b) => idNumber(b.id) - idNumber(a.id)), partial: pages > maxPages };
}

export async function readStudiosWindow(maxPages = 3, opts: Fresh = {}): Promise<ReadResult<{ total: number; rows: Studio[]; partial: boolean }>> {
  return result(await newestFirst(async (o) => (await readStudios(o, PAGE, opts)).data, maxPages));
}

export async function readCommissionsOfWindow(address: string, maxPages = 3, opts: Fresh = {}): Promise<ReadResult<{ total: number; rows: Commission[]; partial: boolean }>> {
  return result(await newestFirst(async (o) => (await readCommissionsOf(address, o, PAGE, opts)).data, maxPages));
}

export async function readStudioCommissionsWindow(studioId: string, maxPages = 2, opts: Fresh = {}): Promise<ReadResult<{ total: number; rows: Commission[]; partial: boolean }>> {
  return result(await newestFirst(async (o) => (await readStudioCommissions(studioId, o, PAGE, opts)).data, maxPages));
}

/** stats(): the contract's totals. */
export async function readStats(opts: Fresh = {}): Promise<ReadResult<Stats>> {
  return result(mapStats(asRow(await view("stats", [], opts))));
}

/** rules(): the contract's own words for its askings, its clock, who may do what and where the money goes. */
export async function readRules(): Promise<ReadResult<Rules>> {
  return result(asRow(await view("rules", [])));
}

// ---- writes: one builder per method (lib/calls.ts) ------------------------------------------------------

export { calls } from "./calls";

/** True for the calls the validators judge with their models: the rail then shows their votes. */
export const isJudged = (fn: WriteFn) => fn === "say" || fn === "deliver";

const WRONG_CHAIN = (chainId: number | null) => `Your wallet is on ${chainName(chainId)}. Switch it to GenLayer Studio (chain 61999) before signing.`;

/** Sends a call through the connected EIP-1193 provider. Resolves to the transaction hash. */
export async function write(call: Call): Promise<string> {
  if (isMock) return mock.write(call);
  const address = contractAddress();
  if (!address) throw new Error("The contract is not deployed yet, so there is nothing to sign.");
  const signer = getSigner();
  if (!signer) throw new Error("Connect a wallet first.");
  // Studio is gasless and the SDK skips its own chain check for it, so the refusal to sign on
  // another chain lives here, and it says which chain the wallet is on.
  const chainId = await getChainId(signer.provider);
  if (chainId !== CHAIN_ID) throw new Error(WRONG_CHAIN(chainId));
  const client = createClient({ chain: studio, account: signer.address as Address, provider: signer.provider });
  const hash = await client.writeContract({
    address: address as Address,
    functionName: call.fn,
    args: call.args,
    value: call.value ?? 0n,
  });
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The wallet returned no transaction hash.");
  return hash;
}

// ---- outcomes: what a finished call's JSON return means ---------------------------------------------

/**
 * True when the leader's return is what the chain stored. A round with no majority, a cancelled tx or
 * one the validators did not accept still carries the leader's JSON, but nothing of it was kept.
 */
export const stored = (s: TxStatus | null): s is TxStatus => !!s && !s.undetermined && s.applied !== false && s.status !== "CANCELED";

/** The tag of a raised error: a rule ([EXPECTED]), a page that could not be read ([TRANSIENT]) or a model failure ([LLM_ERROR]). */
export function errorTag(s: TxStatus | null): "EXPECTED" | "TRANSIENT" | "LLM_ERROR" | "" {
  const m = /\[(EXPECTED|TRANSIENT|LLM_ERROR)\]/.exec(s?.message || "");
  return m ? (m[1] as "EXPECTED" | "TRANSIENT" | "LLM_ERROR") : "";
}

/** The sentence after a raised error's tag, as a sentence; "" when there is none. */
function raisedSentence(s: TxStatus): string {
  const m = /\[(?:EXPECTED|TRANSIENT|LLM_ERROR)\]\s*([^"}\n]+)/.exec(s.message || "");
  return m ? sentence(m[1]) : "";
}

/** The contract's reason for refusing a call, as a sentence; "" when the call was not refused. */
export function refusalReason(s: TxStatus | null): string {
  if (!s) return "";
  const r = s.result;
  if (r && r.ok === false) return sentence(str(r.reason));
  if (s.exec === "ERROR" && !s.undetermined) return raisedSentence(s) || sentence(s.message || "");
  return "";
}

/** True when the transaction finished and the contract did what was asked. */
export function succeeded(s: TxStatus | null): boolean {
  return !!s && s.status === "FINALIZED" && stored(s) && s.exec !== "ERROR" && s.result?.ok !== false;
}

/**
 * A press or a delivery whose round stored nothing because a page could not be read or a model call
 * failed: the leader raised and no validator agrees with a leader that raised. The sentence says why,
 * in the contract's words when the leader's error was readable.
 */
export function unsettledWhy(s: TxStatus | null): string {
  if (!s || !s.undetermined) return "";
  const tag = errorTag(s);
  if (tag === "TRANSIENT" || tag === "LLM_ERROR" || tag === "EXPECTED") return raisedSentence(s);
  return "";
}

/** A plain sentence for a tx that finished without doing what was asked; "" when it did. */
export function failureOf(s: TxStatus | null): string {
  if (!s) return "";
  if (s.undetermined) {
    const why = unsettledWhy(s);
    return why
      ? `${why} The validators did not agree on a value, so nothing was stored, the clock did not move and nothing was paid.`
      : "The validators did not reach a majority, so nothing was stored. Sending the same call again is safe.";
  }
  if (s.status === "CANCELED") return "The network cancelled the transaction. Nothing was stored.";
  const reason = refusalReason(s);
  if (reason) return reason;
  if (s.applied === false) return "The validators did not accept this transaction. Nothing was stored.";
  return "";
}

const ok = (s: TxStatus | null): s is TxStatus & { result: Row } => stored(s) && s.result?.ok === true;

/** open_studio()'s return: the new studio's id, or "". */
export const openedStudio = (s: TxStatus | null): string => (ok(s) && /^S\d+$/.test(str(s.result.studio)) ? str(s.result.studio) : "");

export type Paid = { kind: "done"; result: Row } | { kind: "refused"; reason: string; returnedAtto: string } | { kind: "unknown" };

/** request_commission()'s return: taken, or refused with what came back in the same transaction. */
export function paidOutcome(s: TxStatus | null): Paid {
  if (!stored(s) || !s.result) return { kind: "unknown" };
  if (s.result.ok === true) return { kind: "done", result: s.result };
  if (s.result.ok === false) return { kind: "refused", reason: sentence(str(s.result.reason)), returnedAtto: atto(s.result.returned) };
  return { kind: "unknown" };
}

/** request_commission()'s return: the new commission's id, or "". */
export const requestedCommission = (s: TxStatus | null): string => {
  const p = paidOutcome(s);
  return p.kind === "done" && /^C\d+$/.test(str(p.result.commission)) ? str(p.result.commission) : "";
};

export type PressResult = { message: string; verdict: MessageVerdict; holder: Holder; fp: string; url: string };

/** say()'s or deliver()'s return: the agreed verdict and who holds the move now. */
export function pressOutcome(s: TxStatus | null): PressResult | null {
  if (!ok(s) || !MESSAGE_VERDICTS.includes(str(s.result.verdict) as MessageVerdict)) return null;
  const r = s.result;
  return { message: str(r.message), verdict: verdict(r.verdict), holder: holder(r.holder), fp: fp(r.fp), url: str(r.url) };
}

export type Settled = { status: CommissionStatus; toMakerAtto: string; toClientAtto: string; makerLate: number; cutBps: number; makerUsed: number; clientUsed: number };

/** A settlement's return (withdraw_request, decline, accept_work, claim_silence, cancel_late). */
export function settledOutcome(s: TxStatus | null): Settled | null {
  if (!ok(s) || !STATUSES.includes(str(s.result.status) as CommissionStatus) || s.result.to_maker === undefined) return null;
  const r = s.result;
  return {
    status: status(r.status),
    toMakerAtto: atto(r.to_maker),
    toClientAtto: atto(r.to_client),
    makerLate: num(r.maker_late),
    cutBps: num(r.cut_bps),
    makerUsed: num(r.maker_used),
    clientUsed: num(r.client_used),
  };
}

/** True when GEN moves to or from somebody because of this call, so balances are watched afterwards. */
export function movesMoney(s: TxStatus): boolean {
  const r = s.result;
  if (!r) return false;
  if (r.ok === false) return atto(r.returned) !== "0";
  if (r.ok !== true) return false;
  return atto(r.to_maker) !== "0" || atto(r.to_client) !== "0";
}

// ---- the demo maker ------------------------------------------------------------------------------

let demoCache: { at: number; value: DemoStatus } | null = null;

/** Whether the demo maker can act now, whose it is and which studio it runs. Asked of the site's own server; cached a minute. */
export async function readDemoStatus(): Promise<DemoStatus> {
  if (isMock) return mock.demoStatus();
  if (demoCache && Date.now() - demoCache.at < 60_000) return demoCache.value;
  try {
    const res = await fetch("/api/demo/status", { cache: "no-store" });
    const body = (await res.json()) as Partial<DemoStatus>;
    const s = /^S[1-9]\d{0,8}$/.test(str(body.studio)) ? str(body.studio) : "";
    const value: DemoStatus = {
      online: body.online === true,
      maker: addr(body.maker),
      studio: s || demoStudioFallback(),
      reason: str(body.reason),
      drafts: body.drafts === true,
      draftsReason: str(body.draftsReason),
    };
    demoCache = { at: Date.now(), value };
    return value;
  } catch {
    return { online: false, maker: "", studio: demoStudioFallback(), reason: "the site's server did not answer", drafts: false, draftsReason: "" };
  }
}

async function askDemo(path: string, body: Record<string, string>): Promise<DemoAnswer> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const answer = (await res.json()) as Record<string, unknown>;
    if (answer.ok === true && typeof answer.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(answer.hash)) return { ok: true, hash: answer.hash };
    return { ok: false, reason: sentence(str(answer.reason, "the demo maker did not answer")), retryAfter: num(answer.retryAfter) || undefined };
  } catch {
    return { ok: false, reason: "The site's server did not answer. Try again in a minute." };
  }
}

/** Asks the demo maker to accept a request made of its studio. */
export async function requestDemoAccept(commission: string): Promise<DemoAnswer> {
  if (isMock) return mock.demoAccept(commission);
  return askDemo("/api/demo/accept", { commission });
}

/** Asks the demo maker to do one thing from its fixed script. Nothing the visitor types goes with it. */
export async function requestDemoAct(commission: string, action: string): Promise<DemoAnswer> {
  if (isMock) return mock.demoAct(commission, action);
  return askDemo("/api/demo/act", { commission, action });
}

// ---- transactions, balances, the faucet -------------------------------------------------------------

/** One poll of a transaction. Pages call this every 3 s until it is final. */
export async function txStatus(hash: string): Promise<TxStatus> {
  if (isMock) return mock.txStatus(hash);
  // Two quick tries: the caller polls anyway. eth_* has its own bucket and its own retry budget,
  // so neither a gen_call cooldown nor the gen_call retry loops ever stall the rail.
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), { tries: 2, bucket: "eth", ownBudget: true });
  return decodeTx(tx);
}

/** Balance in atto of an address (eth_getBalance). */
export async function balanceOf(address: string): Promise<bigint> {
  if (isMock) return mock.balanceOf(address);
  const hex = await withRetry(() => rpc<string>("eth_getBalance", [address, "latest"]), { tries: 3, bucket: "eth", ownBudget: true });
  return BigInt(hex || "0x0");
}

const FAUCET_PAUSE_MS = 10_000;
const FAUCET_TRIES = 3;
const FAUCET_WAIT_MS = 60_000;

/**
 * Faucet: sim_fundAccount with 10 GEN, up to three tries ten seconds apart, each after the gen_call
 * cooldown. Resolves when the balance moved. `stillWanted` is asked between balance polls: once it
 * says no (the wallet switched accounts) the wait ends with an error nobody shows.
 */
export async function faucet(address: string, opts: { stillWanted?: () => boolean } = {}): Promise<bigint> {
  if (isMock) return mock.faucet(address);
  // Studio credits only a checksummed address: the lowercase spelling is accepted and never paid.
  let account: string;
  try {
    account = getAddress(address);
  } catch {
    throw new Error("That is not a valid 0x address, so the faucet was not asked.");
  }
  let before: bigint;
  try {
    before = await balanceOf(account);
  } catch {
    throw new Error("Could not read this wallet's balance from Studio, so the faucet was not asked. Try again in a few seconds.");
  }
  let sent = false;
  for (let i = 0; i < FAUCET_TRIES && !sent; i++) {
    await waitForCooldown("gen");
    try {
      // `amount` is wei as a JS number; a decimal string makes the node compare str with int.
      await rpc("sim_fundAccount", { account_address: account, amount: 10e18 });
      sent = true;
    } catch (e) {
      noteFailure(e, Date.now(), "gen");
      if (i === FAUCET_TRIES - 1) throw new Error(FAUCET_REFUSED);
      await sleep(FAUCET_PAUSE_MS);
    }
  }
  const started = Date.now();
  while (Date.now() - started < FAUCET_WAIT_MS) {
    await sleep(2000);
    if (opts.stillWanted && !opts.stillWanted()) throw new Error("The faucet wait ended: the wallet switched accounts.");
    try {
      const now = await balanceOf(account);
      if (now !== before) return now;
    } catch {
      /* a dropped poll is not a failed faucet; keep polling */
    }
  }
  throw new Error("The faucet did not credit the account within 60 s. Try again.");
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER_URL}/address/${address}`;
export const studioPath = (id: string) => `/studios/${id}`;
export const commissionPath = (id: string) => `/c/${id}`;
