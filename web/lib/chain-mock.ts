// A stand-in for the contract, in memory, for NEXT_PUBLIC_MOCK=1. lib/chain.ts delegates here.
//
// It follows contracts/commission_clock.py on everything deterministic: who may call what and when,
// the order of the checks and their refusal sentences word for word, the chess clock (the grace on a
// handed-over turn, since never moving back, the notice before a settlement against the holder), the
// late cut, where every atto goes, the counters, and every view answered in the contract's own JSON
// shape, so the mappers in lib/chain.ts run on the same rows in both modes. The one thing it cannot
// do is ask a model or fetch a page: a press is judged as SCRIPTED from the demo maker's three
// messages and the client's suggested lines (any other message lands unclear here), a delivery is
// read from what the five demo drafts are (any other address cannot be fetched and stores nothing),
// and the demo bar says so on every page.
//
// The visitor acts as one of a few demo accounts. The demo maker runs Fernhill Pottery copy desk and
// acts when its buttons are pressed (demoAccept and demoAct, the in-memory twins of POST
// /api/demo/accept and /api/demo/act). A few commissions are seeded so the ledger and the receipts
// have something to show, and the clock can be moved on so an allowance can be seen running out.
// State lasts as long as the tab.

import type { Call, DemoAnswer, DemoStatus, TxStatus, WriteFn } from "./types.ts";
import { notify } from "./browser-store.ts";
import { REPO_URL } from "./config.ts";
import { capAfter, charged, cutOf, grace, lateTerms, live, moveTo, opensIn, type ClockState } from "./clock.ts";
import { DEMO_ABOUT, DEMO_ACTIONS, DEMO_BRIEF, DEMO_STUDIO_NAME, DEMO_TERMS, actionOf, demoActProblem, draftOf, draftUrl, repoOf, scriptedDelivery, scriptedPress, type DraftKey } from "./demo-studio.ts";
import {
  ACCEPT_WINDOW,
  ADDRESS_CHARS,
  BPS,
  FP_CHARS,
  ID_CHARS,
  KILL_BPS,
  MAX_ABOUT,
  MAX_BRIEF,
  MAX_CLIENT_SECONDS,
  MAX_CUT_BPS,
  MAX_MAKER_SECONDS,
  MAX_MAX_CUT_BPS,
  MAX_NAME,
  MAX_NOTE,
  MAX_PAGE_TEXT,
  MAX_RAW_PAGE,
  MAX_STEP,
  MAX_TEXT,
  MAX_TO_CAP,
  MAX_URL,
  MIN_BRIEF,
  MIN_CLIENT_SECONDS,
  MIN_CUT_BPS,
  MIN_FEE,
  MAX_FEE,
  MIN_MAKER_SECONDS,
  MIN_MAX_CUT_BPS,
  MIN_NAME,
  MIN_STEP,
  MIN_TEXT,
  PAGE,
  PRESS_RULES,
  QUESTION_CARRY,
  QUESTION_HAND,
  QUESTION_MISSING,
  QUESTION_THERE,
  READING,
  THREAD_GAP,
  THREAD_WINDOW,
  TURN_GRACE,
  TURN_NOTICE,
  numberArg,
  other,
  pyStrip,
  termsProblem,
  textProblem,
  urlProblem,
  type CommissionStatus,
  type MessageKind,
  type MessageVerdict,
  type Side,
} from "./rules.ts";

const GEN = 10n ** 18n;
export const MOCK_CONTRACT = "0x0000000000000000000000000000000000c10c4e";
/** The commit the demo build pretends its drafts are pinned to. */
export const MOCK_COMMIT = "0123456789abcdef0123456789abcdef01234567";
export const MOCK_REPO = repoOf(REPO_URL) || "demo-owner/commission-clock";
/** The address of a demo draft under the demo build's pretend commit. */
export const mockDraft = (key: DraftKey): string => draftUrl(MOCK_REPO, MOCK_COMMIT, draftOf(key).file);

const inBrowser = typeof window !== "undefined";
const delay = (ms: number) => (inBrowser ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

// ---- the clock -----------------------------------------------------------------------------------

let clockOffset = 0;
/** The mock's message clock, in seconds: the browser's clock plus however far the visitor moved it on. */
export const mockNow = (): number => Math.floor(Date.now() / 1000) + clockOffset;
/** How far the clock has been moved on, in seconds: a stable snapshot for useSyncExternalStore. */
export const mockClockOffset = (): number => clockOffset;
/** Moves the mock clock on, so an allowance can be seen running out. */
export function advanceClock(seconds: number): void {
  clockOffset += Math.max(0, Math.floor(seconds));
  notify();
}

// ---- who the visitor is acting as -----------------------------------------------------------------

export type Persona = { address: string; name: string; note: string };

export const VISITOR = "0x5e1a3c9b07d24f68a1e3c5b7d9f0a2c4e6b8d0f1";
export const MY_MAKER = "0x7a2c4e6f81b3d5a7c9e0f2a4b6d8c0e1f3a5b7c9";
export const DEMO_MAKER = "0xd3e5f7a9b1c2d4e6f8a0b2c4d6e8f0a1b3c5d7e9";
export const EARLIER_CLIENT = "0xb4d6f8a0c2e4a6b8d0f2c4e6a8b0d2f4c6e8a0b2";
export const PASSER_BY = "0x91c3e5a7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9";

/** The accounts a visitor can act as in mock mode. The first is a newcomer with test GEN. */
export const PERSONAS: Persona[] = [
  { address: VISITOR, name: "You, a client", note: "commission the demo studio and play the client" },
  { address: MY_MAKER, name: "You, a maker", note: "Larkspur Lettering runs S2; C4 waits, C5 can be claimed" },
  { address: EARLIER_CLIENT, name: "An earlier client", note: "five commissions, one settled each way" },
  { address: PASSER_BY, name: "A passer-by", note: "may read everything and sign nothing that counts" },
  { address: DEMO_MAKER, name: "The demo maker", note: "runs Fernhill Pottery copy desk, S1" },
];

let persona = VISITOR;
/** The address the mock treats as the connected wallet. */
export const mockAddress = (): string => persona;
export function setMockPersona(address: string): void {
  if (PERSONAS.some((p) => p.address === address)) persona = address;
  notify();
}

// ---- balances -------------------------------------------------------------------------------------

const balances = new Map<string, bigint>([
  [VISITOR, 20n * GEN],
  [MY_MAKER, 12n * GEN],
  [DEMO_MAKER, 30n * GEN],
  [EARLIER_CLIENT, 25n * GEN],
  [PASSER_BY, 3n * GEN],
]);
const balance = (a: string) => balances.get(a.toLowerCase()) ?? 0n;
const credit = (a: string, v: bigint) => {
  balances.set(a.toLowerCase(), balance(a) + v);
  notify();
};
/** The balance as a decimal string: a stable snapshot for useSyncExternalStore. */
export const mockBalanceText = (address: string): string => balance(address).toString();
/** The contract's own balance: every fee held for a commission requested or active. */
let contractBalance = 0n;
export const mockContractBalance = (): bigint => contractBalance;

// ---- the contract's state -----------------------------------------------------------------------

type StudioRec = {
  maker: string;
  name: string;
  about: string;
  fee: bigint;
  maker_seconds: number;
  client_seconds: number;
  step_seconds: number;
  cut_bps: number;
  max_cut_bps: number;
  accepting: boolean;
  opened_at: number;
  n_commissions: number;
  n_on_time: number;
  n_late: number;
  n_cancelled: number;
  n_lapsed: number;
  n_declined: number;
  n_withdrawn: number;
  n_presses: number;
  n_passed: number;
  n_kept: number;
  n_unclear: number;
  n_deliveries: number;
  n_delivered: number;
  n_missing: number;
  late_seconds: number;
};

type CommissionRec = ClockState & {
  studio_id: string;
  client: string;
  maker: string;
  brief: string;
  fee: bigint;
  status: CommissionStatus;
  requested_at: number;
  accepted_at: number;
  settled_at: number;
  n_messages: number;
  n_deliveries: number;
  last_url: string;
  last_fp: string;
  last_delivered_at: number;
  maker_late: number;
  cut_bps_total: number;
  maker_paid: bigint;
  client_paid: bigint;
  held: bigint;
};

type MessageRec = { commission_id: string; n: number; role: Side; kind: MessageKind; text: string; url: string; verdict: MessageVerdict; fp: string; at: number };

const studioRows = new Map<string, StudioRec>();
const commissionRows = new Map<string, CommissionRec>();
const messageRows = new Map<string, MessageRec>();
const lists = new Map<string, string[]>();
const n = {
  studio_count: 0,
  commission_count: 0,
  held_total: 0n,
  taken_total: 0n,
  to_makers: 0n,
  to_clients: 0n,
  returned: 0n,
  n_refused: 0,
  n_waiting: 0,
  n_active: 0,
  n_accepted: 0,
  n_by_silence: 0,
  n_lapsed: 0,
  n_cancelled: 0,
  n_withdrawn: 0,
  n_declined: 0,
  n_presses: 0,
  n_passed: 0,
  n_kept: 0,
  n_unclear: 0,
  n_noted: 0,
  n_takes: 0,
  n_deliveries: 0,
  n_delivered: 0,
  n_missing: 0,
  n_delivery_unclear: 0,
};

/** A refusal that raises: nothing is stored, and the receipt carries the sentence. */
class Refused extends Error {}
const fail = (message: string): never => {
  throw new Refused("[EXPECTED] " + message);
};
/** A round that stores nothing: the page could not be read. The tag is the contract's. */
class NotSettled extends Error {}

type Ctx = { sender: string; value: bigint; now: number };
type Row = Record<string, unknown>;

const isStr = (v: unknown): v is string => typeof v === "string";

const clock = (c: Ctx): number => {
  if (c.now < 0) fail("no readable clock on this transaction; no turn can be measured");
  return c.now;
};

function studioOf(id: string): StudioRec {
  const s = studioRows.get(id);
  if (!s) return fail("no studio " + id.slice(0, ID_CHARS));
  return s;
}
function commissionOf(id: string): CommissionRec {
  const c = commissionRows.get(id);
  if (!c) return fail("no commission " + id.slice(0, ID_CHARS));
  return c;
}
function idArg(raw: unknown): string {
  if (!isStr(raw)) fail("the commission id is a string");
  return pyStrip(raw as string);
}

const push = (key: string, id: string) => lists.set(key, [...(lists.get(key) ?? []), id]);

function transfer(to: string, value: bigint): void {
  contractBalance -= value;
  credit(to, value);
}

// ---- the writes -----------------------------------------------------------------------------------

function openStudio(c: Ctx, args: unknown[]): Row {
  const [rawName, rawAbout] = args;
  if (!isStr(rawName) || !isStr(rawAbout)) fail("the name and the about line are strings");
  const name = pyStrip(rawName as string);
  const about = pyStrip(rawAbout as string);
  let problem = textProblem(name, MIN_NAME, MAX_NAME, "the name");
  if (problem) fail(problem);
  problem = textProblem(about, 0, MAX_ABOUT, "the about line");
  if (problem) fail(problem);
  const [fee, maker, client, step, cut, cap] = [args[2], args[3], args[4], args[5], args[6], args[7]].map(numberArg);
  problem = termsProblem({ fee, maker, client, step, cut, cap });
  if (problem) fail(problem);
  const now = clock(c);
  n.studio_count++;
  const id = "S" + n.studio_count;
  studioRows.set(id, {
    maker: c.sender, name, about, fee, maker_seconds: Number(maker), client_seconds: Number(client), step_seconds: Number(step), cut_bps: Number(cut),
    max_cut_bps: Number(cap), accepting: true, opened_at: now, n_commissions: 0, n_on_time: 0, n_late: 0, n_cancelled: 0, n_lapsed: 0, n_declined: 0,
    n_withdrawn: 0, n_presses: 0, n_passed: 0, n_kept: 0, n_unclear: 0, n_deliveries: 0, n_delivered: 0, n_missing: 0, late_seconds: 0,
  });
  push("maker:" + c.sender, id);
  return {
    ok: true, studio: id, maker: c.sender, name, fee: fee.toString(), maker_seconds: Number(maker), client_seconds: Number(client), step_seconds: Number(step),
    cut_bps: Number(cut), max_cut_bps: Number(cap), opened_at: now,
  };
}

function closeStudio(c: Ctx, raw: unknown): Row {
  if (!isStr(raw)) fail("the studio id is a string");
  const id = pyStrip(raw as string);
  const s = studioOf(id);
  if (c.sender !== s.maker) fail("only the maker of " + id + " may close it");
  if (!s.accepting) fail(id + " is already closed to new commissions");
  s.accepting = false;
  return { ok: true, studio: id, accepting: false };
}

function reopenStudio(c: Ctx, raw: unknown): Row {
  if (!isStr(raw)) fail("the studio id is a string");
  const id = pyStrip(raw as string);
  const s = studioOf(id);
  if (c.sender !== s.maker) fail("only the maker of " + id + " may reopen it");
  if (s.accepting) fail(id + " is already open to new commissions");
  s.accepting = true;
  return { ok: true, studio: id, accepting: true };
}

function refuse(sender: string, value: bigint, reason: string, fields: Row): Row {
  n.n_refused++;
  n.returned += value;
  if (value > 0n) transfer(sender, value);
  return { ok: false, ...fields, reason, returned: value.toString() };
}

function requestCommission(c: Ctx, rawStudio: unknown, rawBrief: unknown): Row {
  const value = c.value;
  const who = c.sender;
  let problem = "";
  let id = "";
  let brief = "";
  if (!isStr(rawStudio) || !isStr(rawBrief)) {
    problem = "the studio id and the brief are strings";
  } else {
    id = pyStrip(rawStudio);
    brief = pyStrip(rawBrief);
    if (!studioRows.has(id)) problem = "no studio " + id.slice(0, ID_CHARS);
  }
  let now = -1;
  if (!problem) {
    const s = studioRows.get(id)!;
    now = c.now;
    if (who === s.maker) problem = "the maker of " + id + " may not commission its own studio";
    else if (!s.accepting) problem = id + " is closed to new commissions";
    else if (now < 0) problem = "no readable clock on this transaction; no turn can be measured";
    else if (value !== s.fee) problem = "send exactly the fee of " + s.fee + " atto to commission " + id + "; this one sent " + value;
    else problem = textProblem(brief, MIN_BRIEF, MAX_BRIEF, "the brief");
  }
  if (problem) return refuse(who, value, problem, { studio: id.slice(0, ID_CHARS), commission: "" });
  const s = studioRows.get(id)!;
  n.commission_count++;
  const cid = "C" + n.commission_count;
  commissionRows.set(cid, {
    studio_id: id, client: who, maker: s.maker, brief, fee: value, makerSeconds: s.maker_seconds, clientSeconds: s.client_seconds, stepSeconds: s.step_seconds,
    cutBps: s.cut_bps, maxCutBps: s.max_cut_bps, status: "requested", holder: "", since: 0, handedBy: 0, makerUsed: 0, clientUsed: 0, requested_at: now,
    accepted_at: 0, settled_at: 0, n_messages: 0, n_deliveries: 0, last_url: "", last_fp: "", last_delivered_at: 0, maker_late: 0, cut_bps_total: 0,
    maker_paid: 0n, client_paid: 0n, held: value,
  });
  s.n_commissions++;
  n.held_total += value;
  n.taken_total += value;
  n.n_waiting++;
  push("party:" + who, cid);
  push("party:" + s.maker, cid);
  push("studio:" + id, cid);
  return { ok: true, commission: cid, studio: id, client: who, maker: s.maker, fee: value.toString(), held: value.toString(), status: "requested", requested_at: now };
}

function settle(c: CommissionRec, status: CommissionStatus, toMakerRaw: bigint, now: number, late: number, total: number): void {
  const wasActive = c.status === "active";
  moveTo(c, "", now, 0);
  const held = c.held;
  const toMaker = toMakerRaw < 0n ? 0n : toMakerRaw > held ? held : toMakerRaw;
  const toClient = held - toMaker;
  c.held = 0n;
  c.status = status;
  c.settled_at = now;
  c.maker_late = late;
  c.cut_bps_total = total;
  c.maker_paid = toMaker;
  c.client_paid = toClient;
  const s = studioRows.get(c.studio_id)!;
  if (wasActive) {
    n.n_active--;
    s.late_seconds += late;
  } else n.n_waiting--;
  if (status === "accepted" || status === "accepted_by_silence") {
    if (late > 0) s.n_late++;
    else s.n_on_time++;
    if (status === "accepted") n.n_accepted++;
    else n.n_by_silence++;
  } else if (status === "lapsed") {
    s.n_lapsed++;
    n.n_lapsed++;
  } else if (status === "cancelled_late") {
    s.n_cancelled++;
    n.n_cancelled++;
  } else if (status === "declined") {
    s.n_declined++;
    n.n_declined++;
  } else {
    s.n_withdrawn++;
    n.n_withdrawn++;
  }
  n.held_total -= held;
  n.to_makers += toMaker;
  n.to_clients += toClient;
  if (toMaker > 0n) transfer(c.maker, toMaker);
  if (toClient > 0n) transfer(c.client, toClient);
}

const settled = (cid: string, c: CommissionRec): Row => ({
  ok: true, commission: cid, status: c.status, maker_used: c.makerUsed, client_used: c.clientUsed, maker_late: c.maker_late, cut_bps: c.cut_bps_total,
  to_maker: c.maker_paid.toString(), to_client: c.client_paid.toString(), settled_at: c.settled_at,
});

function withdrawRequest(c: Ctx, raw: unknown): Row {
  const cid = idArg(raw);
  const co = commissionOf(cid);
  if (c.sender !== co.client) fail("only the client of " + cid + " may withdraw its request");
  if (co.status !== "requested") fail(cid + " is " + co.status + "; a request can be withdrawn only before the maker accepts it");
  const now = clock(c);
  settle(co, "withdrawn", 0n, now, 0, 0);
  return settled(cid, co);
}

function decline(c: Ctx, raw: unknown): Row {
  const cid = idArg(raw);
  const co = commissionOf(cid);
  if (c.sender !== co.maker) fail("only the maker of " + cid + " may decline it");
  if (co.status !== "requested") fail(cid + " is " + co.status + "; only a request not yet accepted can be declined");
  const now = clock(c);
  settle(co, "declined", 0n, now, 0, 0);
  return settled(cid, co);
}

function accept(c: Ctx, raw: unknown): Row {
  const cid = idArg(raw);
  const co = commissionOf(cid);
  if (c.sender !== co.maker) fail("only the maker of " + cid + " may accept it");
  if (co.status !== "requested") fail(cid + " is " + co.status + "; only a request can be accepted");
  const now = clock(c);
  if (now - co.requested_at > ACCEPT_WINDOW)
    fail(
      cid + " was requested " + (now - co.requested_at) + " seconds ago; a request can be accepted " + "within " + ACCEPT_WINDOW +
        " seconds, and after that only withdrawn by the client or " + "declined by the maker",
    );
  co.status = "active";
  co.holder = "maker";
  co.since = now;
  co.accepted_at = now;
  n.n_waiting--;
  n.n_active++;
  return { ok: true, commission: cid, status: "active", holder: "maker", since: now };
}

function log(cid: string, c: CommissionRec, role: Side, kind: MessageKind, text: string, url: string, verdict: MessageVerdict, fp: string, now: number): number {
  const k = c.n_messages + 1;
  messageRows.set(cid + "#" + k, { commission_id: cid, n: k, role, kind, text, url, verdict, fp, at: now });
  c.n_messages = k;
  return k;
}

function say(c: Ctx, rawId: unknown, rawText: unknown): Row {
  if (!isStr(rawId) || !isStr(rawText)) fail("the commission id and the message are strings");
  const cid = pyStrip(rawId as string);
  const text = pyStrip(rawText as string);
  const co = commissionOf(cid);
  const who = c.sender;
  if (who !== co.maker && who !== co.client) fail("only the maker or the client of " + cid + " may write in its thread");
  if (co.status !== "active") fail(cid + " is " + co.status + "; messages are taken while it is active");
  const problem = textProblem(text, MIN_TEXT, MAX_TEXT, "a message");
  if (problem) fail(problem);
  const now = clock(c);
  const role: Side = who === co.maker ? "maker" : "client";
  const pressed = role === co.holder;
  const verdict: MessageVerdict = pressed ? scriptedPress(text) : "noted";
  const k = log(cid, co, role, "say", text, "", verdict, "", now);
  const s = studioRows.get(co.studio_id)!;
  if (pressed) {
    s.n_presses++;
    n.n_presses++;
    if (verdict === "pass") {
      s.n_passed++;
      n.n_passed++;
      moveTo(co, other(role), now, k);
    } else if (verdict === "keep") {
      s.n_kept++;
      n.n_kept++;
    } else {
      s.n_unclear++;
      n.n_unclear++;
    }
  } else n.n_noted++;
  return {
    ok: true, commission: cid, message: cid + "#" + k, role, verdict, holder: co.holder, since: co.since, maker_used: co.makerUsed, client_used: co.clientUsed, at: now,
  };
}

function deliver(c: Ctx, rawId: unknown, rawUrl: unknown, rawNote: unknown): Row {
  if (!isStr(rawId) || !isStr(rawUrl) || !isStr(rawNote)) fail("the commission id, the page address and the note are strings");
  const cid = pyStrip(rawId as string);
  const url = pyStrip(rawUrl as string);
  const note = pyStrip(rawNote as string);
  const co = commissionOf(cid);
  if (c.sender !== co.maker) fail("only the maker of " + cid + " may deliver on it");
  if (co.status !== "active") fail(cid + " is " + co.status + "; a delivery is taken while it is active");
  let problem = urlProblem(url);
  if (problem) fail(problem);
  problem = textProblem(note, 0, MAX_NOTE, "the note");
  if (problem) fail(problem);
  const now = clock(c);
  const reading = scriptedDelivery(url);
  if ("error" in reading) throw new NotSettled(reading.error);
  const { verdict, fp } = reading;
  const k = log(cid, co, "maker", "deliver", note, url, verdict, fp, now);
  const s = studioRows.get(co.studio_id)!;
  s.n_deliveries++;
  n.n_deliveries++;
  if (verdict === "delivered") {
    co.n_deliveries++;
    co.last_url = url;
    co.last_fp = fp;
    co.last_delivered_at = now;
    s.n_delivered++;
    n.n_delivered++;
    if (co.holder === "maker") moveTo(co, "client", now, k);
  } else if (verdict === "missing") {
    s.n_missing++;
    n.n_missing++;
  } else n.n_delivery_unclear++;
  return {
    ok: true, commission: cid, message: cid + "#" + k, url, verdict, fp, deliveries: co.n_deliveries, holder: co.holder, since: co.since, maker_used: co.makerUsed,
    client_used: co.clientUsed, at: now,
  };
}

function takeMove(c: Ctx, raw: unknown): Row {
  const cid = idArg(raw);
  const co = commissionOf(cid);
  const who = c.sender;
  if (who !== co.maker && who !== co.client) fail("only the maker or the client of " + cid + " may take its move");
  if (co.status !== "active") fail(cid + " is " + co.status + "; the move can be taken while it is active");
  const role: Side = who === co.maker ? "maker" : "client";
  if (co.holder === role) fail("the " + role + " already holds the move on " + cid);
  const now = clock(c);
  moveTo(co, role, now, 0);
  const k = log(cid, co, role, "take", "", "", "taken", "", now);
  n.n_takes++;
  return { ok: true, commission: cid, message: cid + "#" + k, holder: role, since: co.since, maker_used: co.makerUsed, client_used: co.clientUsed };
}

function acceptWork(c: Ctx, raw: unknown): Row {
  const cid = idArg(raw);
  const co = commissionOf(cid);
  if (c.sender !== co.client) fail("only the client of " + cid + " may accept its work");
  if (co.status !== "active") fail(cid + " is " + co.status + "; work is accepted while it is active");
  if (co.n_deliveries < 1) fail("nothing has been delivered on " + cid + " yet; the maker delivers with a page first");
  const now = clock(c);
  const { late, total } = lateTerms(co, now);
  settle(co, "accepted", co.fee - cutOf(co.fee, total), now, late, total);
  return settled(cid, co);
}

function claimSilence(c: Ctx, raw: unknown): Row {
  const cid = idArg(raw);
  const co = commissionOf(cid);
  if (c.sender !== co.maker) fail("only the maker of " + cid + " may claim the client's silence");
  if (co.status !== "active") fail(cid + " is " + co.status + "; silence is claimed while it is active");
  if (co.holder !== "client") fail("the maker holds the move on " + cid + "; silence is claimed only while the client holds it");
  const now = clock(c);
  const used = live(co, "client", now);
  const left = opensIn(co, now, Math.max(TURN_NOTICE, co.clientSeconds + 1 - co.clientUsed));
  if (left > 0)
    fail(
      "the client has used " + used + " of its " + co.clientSeconds + " seconds on " + cid + "; silence can be claimed once it is past them and its current turn has been charged " +
        TURN_NOTICE + " seconds, in " + left + " seconds if it does not move",
    );
  const { late, total } = lateTerms(co, now);
  if (co.n_deliveries > 0) settle(co, "accepted_by_silence", co.fee - cutOf(co.fee, total), now, late, total);
  else settle(co, "lapsed", cutOf(co.fee, Math.min(KILL_BPS, BPS - total)), now, late, total);
  return settled(cid, co);
}

function cancelLate(c: Ctx, raw: unknown): Row {
  const cid = idArg(raw);
  const co = commissionOf(cid);
  if (c.sender !== co.client) fail("only the client of " + cid + " may cancel it");
  if (co.status !== "active") fail(cid + " is " + co.status + "; a commission is cancelled while it is active");
  if (co.holder !== "maker") fail("the client holds the move on " + cid + "; it can be cancelled only while the maker holds it");
  const now = clock(c);
  const { late, total } = lateTerms(co, now);
  const left = opensIn(co, now, Math.max(TURN_NOTICE, capAfter(co) + 1 - co.makerUsed));
  if (left > 0)
    fail(
      "the maker's cut on " + cid + " is " + total + " of its " + co.maxCutBps + " basis point cap; it can be cancelled once the cut is at the cap and the maker's current turn " +
        "has been charged " + TURN_NOTICE + " seconds, in " + left + " seconds if the maker does not move",
    );
  const toMaker = co.n_deliveries > 0 ? co.fee - cutOf(co.fee, total) : 0n;
  settle(co, "cancelled_late", toMaker, now, late, total);
  return settled(cid, co);
}

function run(fn: WriteFn, args: unknown[], c: Ctx): Row {
  switch (fn) {
    case "open_studio":
      return openStudio(c, args);
    case "close_studio":
      return closeStudio(c, args[0]);
    case "reopen_studio":
      return reopenStudio(c, args[0]);
    case "request_commission":
      return requestCommission(c, args[0], args[1]);
    case "withdraw_request":
      return withdrawRequest(c, args[0]);
    case "decline":
      return decline(c, args[0]);
    case "accept":
      return accept(c, args[0]);
    case "say":
      return say(c, args[0], args[1]);
    case "deliver":
      return deliver(c, args[0], args[1], args[2]);
    case "take_move":
      return takeMove(c, args[0]);
    case "accept_work":
      return acceptWork(c, args[0]);
    case "claim_silence":
      return claimSilence(c, args[0]);
    case "cancel_late":
      return cancelLate(c, args[0]);
  }
}

// ---- the views ------------------------------------------------------------------------------------

function studioRow(id: string): Row {
  const s = studioRows.get(id)!;
  return {
    studio: id, maker: s.maker, name: s.name, about: s.about, fee: s.fee.toString(), maker_seconds: s.maker_seconds, client_seconds: s.client_seconds,
    step_seconds: s.step_seconds, cut_bps: s.cut_bps, max_cut_bps: s.max_cut_bps, kill_bps: KILL_BPS, accepting: s.accepting, opened_at: s.opened_at,
    record: {
      commissions: s.n_commissions, on_time: s.n_on_time, late: s.n_late, cancelled_late: s.n_cancelled, lapsed: s.n_lapsed, declined: s.n_declined,
      withdrawn: s.n_withdrawn, presses: s.n_presses, passed: s.n_passed, kept: s.n_kept, unclear: s.n_unclear, deliveries: s.n_deliveries,
      delivered: s.n_delivered, missing: s.n_missing, late_seconds: s.late_seconds,
    },
  };
}

function commissionRow(cid: string): Row {
  const c = commissionRows.get(cid)!;
  const s = studioRows.get(c.studio_id)!;
  return {
    commission: cid, studio: c.studio_id, studio_name: s.name, maker: c.maker, client: c.client, brief: c.brief, fee: c.fee.toString(), status: c.status,
    holder: c.holder, since: c.since, handed_by: c.handedBy, grace: grace(c), maker_used: c.makerUsed, client_used: c.clientUsed, maker_seconds: c.makerSeconds,
    client_seconds: c.clientSeconds, step_seconds: c.stepSeconds, cut_bps: c.cutBps, max_cut_bps: c.maxCutBps, cap_after: capAfter(c), kill_bps: KILL_BPS,
    requested_at: c.requested_at, accepted_at: c.accepted_at, settled_at: c.settled_at, messages: c.n_messages, deliveries: c.n_deliveries,
    last_url: c.last_url, last_fp: c.last_fp, last_delivered_at: c.last_delivered_at, maker_late: c.maker_late, cut_bps_total: c.cut_bps_total,
    maker_paid: c.maker_paid.toString(), client_paid: c.client_paid.toString(), held: c.held.toString(),
  };
}

function messageRow(key: string): Row {
  const m = messageRows.get(key)!;
  return { message: key, n: m.n, role: m.role, kind: m.kind, text: m.text, url: m.url, verdict: m.verdict, fp: m.fp, at: m.at };
}

function pageOf(key: string, offset: unknown, limit: unknown): { total: number; start: number; size: number; ids: string[] } {
  const all = lists.get(key) ?? [];
  const off = numberArg(offset);
  const start = Number(off < 0n ? 0n : off);
  let size = Number(numberArg(limit));
  size = size < 1 || size > PAGE ? PAGE : size;
  return { total: all.length, start, size, ids: all.slice(start, Math.min(all.length, start + size)) };
}

function counted(total: number, offset: unknown, limit: unknown): { start: number; size: number; numbers: number[] } {
  const off = numberArg(offset);
  const start = Number(off < 0n ? 0n : off);
  let size = Number(numberArg(limit));
  size = size < 1 || size > PAGE ? PAGE : size;
  const numbers: number[] = [];
  for (let k = start + 1; k <= Math.min(total, start + size); k++) numbers.push(k);
  return { start, size, numbers };
}

/** rules(), as the contract publishes it. */
const RULES = {
  press: {
    value: '{"verdict": "pass" | "keep" | "unclear"}',
    askings: [
      "1, blocks BRIEF, THREAD, MESSAGE: " + QUESTION_HAND,
      "2, blocks BRIEF, MESSAGE, THREAD: " + QUESTION_HAND,
      "3, blocks BRIEF, THREAD, MESSAGE: " + QUESTION_CARRY,
      "4, blocks BRIEF, MESSAGE, THREAD: " + QUESTION_CARRY,
    ],
    rules: PRESS_RULES,
    sides: "{holder} is the side that holds the move and {other} the other side: the words maker and client, put in by the contract",
    thread:
      "the last " + THREAD_WINDOW + " earlier messages, oldest first, one line each, labelled MAKER or CLIENT; when the message that handed the holder the move is older, it " +
      "comes first, followed by the line " + THREAD_GAP,
    combine: { pass: "HAND yes in both orders and CARRY no in both orders", keep: "HAND no in both orders and CARRY yes in both orders", unclear: "anything else" },
    outcome: {
      pass: "the move goes to the other side",
      keep: "the move stays",
      unclear: "the move stays; the holder may rephrase",
      noted: "a message from the side that does not hold the move: recorded, nobody asked",
    },
  },
  delivery: {
    value: '{"verdict": "delivered" | "missing" | "unclear", "fp": "<16 hex>"}',
    askings: [
      "1, blocks BRIEF then PAGE: " + QUESTION_THERE,
      "2, blocks PAGE then BRIEF: " + QUESTION_THERE,
      "3, blocks BRIEF then PAGE: " + QUESTION_MISSING,
      "4, blocks PAGE then BRIEF: " + QUESTION_MISSING,
    ],
    reading: READING,
    page:
      "fetched by every validator itself, its status first: 400 or above is a failed read and stores nothing; then as text, the whitespace of the first " + MAX_RAW_PAGE +
      " characters collapsed to single spaces, the first " + MAX_PAGE_TEXT + " characters of that judged; fp is the first " + FP_CHARS + " hex characters of their sha256",
    combine: { delivered: "THERE yes in both orders and MISSING no in both orders", missing: "THERE no in both orders and MISSING yes in both orders", unclear: "anything else" },
    outcome: {
      delivered: "recorded as the latest delivery; the move goes to the client if the maker held it",
      missing: "nothing changes but the thread and the record",
      unclear: "nothing changes but the thread and the record",
    },
  },
  compared: "the whole value, by exact equality; every validator does all the work itself inside one consensus block, and never agrees with a leader that raised",
  clock:
    "the move is the maker's from acceptance; a turn starts at the time of the transaction that began it; a turn handed over by a judged message or a delivery is not charged for its first " +
    TURN_GRACE +
    " seconds, while a turn a side takes itself, or the maker's first turn, is charged from its own transaction; handing the move over adds the running turn's charged seconds to the holder's used seconds; a side's live use is its used seconds plus max(0, now - since - grace) while it holds the move; since never moves back; time comes from the transaction's own datetime",
  money: {
    request_commission: "the client pays exactly the studio's fee; it is held here",
    withdraw_request: "before acceptance, the client: the whole fee back",
    decline: "before acceptance, the maker: the whole fee back to the client",
    late_cut: "maker_late = max(0, maker live use - maker_seconds); cut_bps = min(max_cut_bps, ceil(maker_late / step_seconds) * cut_bps); cut = fee * cut_bps // " + BPS,
    accept_work: "the maker gets fee - cut, the client gets cut",
    claim_silence:
      "with a delivery: as accept_work; without: the maker gets fee * min(" + KILL_BPS + ", " + BPS + " - cut_bps) // " + BPS + ", a kill fee of " + KILL_BPS +
      " basis points that never comes to more than fee - cut, and the client the rest",
    cancel_late: "without a delivery, the whole fee back to the client; with one, as accept_work at the cap: the maker gets fee - cut, the client gets cut",
    refusal: "a refused payable call returns everything sent, in the same transaction",
    balance: "the contract holds exactly the fees of the commissions requested or active",
  },
  who: {
    open_studio: "anyone; the sender is the maker; the terms are fixed for good",
    close_studio: "the maker; stops new commissions only",
    reopen_studio: "the maker",
    request_commission: "anyone but the maker, with exactly the fee, while the studio is open",
    withdraw_request: "the client, before acceptance",
    decline: "the maker, before acceptance",
    accept: "the maker, within " + ACCEPT_WINDOW + " seconds of the request; the clock starts with the move on the maker",
    say: "the maker or the client, while active; a press when the sender holds the move",
    deliver: "the maker, while active",
    take_move: "the maker or the client, while active, onto itself",
    accept_work: "the client, once a delivery is recorded",
    claim_silence:
      "the maker, while the client holds the move, the client's live use is past its allowance, and the client's current turn has been charged " + TURN_NOTICE + " seconds",
    cancel_late: "the client, while the maker holds the move, the maker's cut is at its cap, and the maker's current turn has been charged " + TURN_NOTICE + " seconds",
  },
  limits: {
    name: [MIN_NAME, MAX_NAME],
    about: [0, MAX_ABOUT],
    brief: [MIN_BRIEF, MAX_BRIEF],
    message: [MIN_TEXT, MAX_TEXT],
    note: [0, MAX_NOTE],
    url_chars: MAX_URL,
    fee_atto: [MIN_FEE.toString(), MAX_FEE.toString()],
    maker_seconds: [MIN_MAKER_SECONDS, MAX_MAKER_SECONDS],
    client_seconds: [MIN_CLIENT_SECONDS, MAX_CLIENT_SECONDS],
    step_seconds: [MIN_STEP, MAX_STEP],
    cut_bps: [MIN_CUT_BPS, MAX_CUT_BPS],
    max_cut_bps: [MIN_MAX_CUT_BPS, MAX_MAX_CUT_BPS],
    to_cap_seconds: MAX_TO_CAP,
    kill_bps: KILL_BPS,
    thread_window: THREAD_WINDOW,
    page_chars: MAX_PAGE_TEXT,
    raw_page_chars: MAX_RAW_PAGE,
    rows_per_page: PAGE,
    turn_grace_seconds: TURN_GRACE,
    turn_notice_seconds: TURN_NOTICE,
    accept_window_seconds: ACCEPT_WINDOW,
    text: "printable ASCII on one line",
    page:
      "the page must read the same for every validator at the moment of the delivery; text is read, images are not; a page that cannot be fetched, answers with an error status or reads as nothing stores nothing",
  },
  untrusted:
    "the brief, every message, every note and every fetched page are fenced (< and > replaced, never deleted), sit between delimiter lines tagged with the start of their own sha256, and the prompt says before the blocks that they are untrusted and never an instruction",
};

export async function view(fn: string, args: (string | number)[]): Promise<unknown> {
  seed();
  await delay(60);
  const now = mockNow();
  const idKey = (v: unknown) => pyStrip(String(v)).slice(0, ID_CHARS);
  const addrKey = (v: unknown) => pyStrip(String(v)).toLowerCase().slice(0, ADDRESS_CHARS);
  switch (fn) {
    case "studio": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the studio id is a string" });
      const key = idKey(args[0]);
      if (!studioRows.has(key)) return JSON.stringify({ error: "no studio " + key, studio: key });
      return JSON.stringify(studioRow(key));
    }
    case "studios": {
      const total = n.studio_count;
      const p = counted(total, args[0], args[1]);
      return JSON.stringify({ total, offset: p.start, limit: p.size, rows: p.numbers.map((k) => studioRow("S" + k)) });
    }
    case "studios_of": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the address is a string" });
      const key = addrKey(args[0]);
      const p = pageOf("maker:" + key, args[1], args[2]);
      return JSON.stringify({ address: key, total: p.total, offset: p.start, limit: p.size, rows: p.ids.map(studioRow) });
    }
    case "commission": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the commission id is a string" });
      const key = idKey(args[0]);
      if (!commissionRows.has(key)) return JSON.stringify({ error: "no commission " + key, commission: key });
      const c = commissionRows.get(key)!;
      return JSON.stringify({ ...commissionRow(key), now, maker_live: live(c, "maker", now), client_live: live(c, "client", now) });
    }
    case "messages_of": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the commission id is a string" });
      const key = idKey(args[0]);
      if (!commissionRows.has(key)) return JSON.stringify({ error: "no commission " + key, commission: key });
      const total = commissionRows.get(key)!.n_messages;
      const p = counted(total, args[1], args[2]);
      return JSON.stringify({ commission: key, total, offset: p.start, limit: p.size, rows: p.numbers.map((k) => messageRow(key + "#" + k)) });
    }
    case "commissions_of": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the address is a string" });
      const key = addrKey(args[0]);
      const p = pageOf("party:" + key, args[1], args[2]);
      const rows = p.ids.map((i) => {
        const row = commissionRow(i);
        return { ...row, role: row.maker === key ? "maker" : "client" };
      });
      return JSON.stringify({ address: key, total: p.total, offset: p.start, limit: p.size, rows });
    }
    case "studio_commissions": {
      if (!isStr(args[0])) return JSON.stringify({ error: "the studio id is a string" });
      const key = idKey(args[0]);
      const p = pageOf("studio:" + key, args[1], args[2]);
      return JSON.stringify({ studio: key, total: p.total, offset: p.start, limit: p.size, rows: p.ids.map(commissionRow) });
    }
    case "stats":
      return JSON.stringify({
        studios: n.studio_count, commissions: n.commission_count, waiting: n.n_waiting, active: n.n_active, accepted: n.n_accepted,
        accepted_by_silence: n.n_by_silence, lapsed: n.n_lapsed, cancelled_late: n.n_cancelled, withdrawn: n.n_withdrawn, declined: n.n_declined,
        presses: n.n_presses, passed: n.n_passed, kept: n.n_kept, unclear: n.n_unclear, noted: n.n_noted, takes: n.n_takes, deliveries: n.n_deliveries,
        delivered: n.n_delivered, missing: n.n_missing, delivery_unclear: n.n_delivery_unclear, held: n.held_total.toString(), taken: n.taken_total.toString(),
        to_makers: n.to_makers.toString(), to_clients: n.to_clients.toString(), refused_payments: n.n_refused, returned: n.returned.toString(),
      });
    case "rules":
      return JSON.stringify(RULES);
    default:
      throw new Error("the mock has no view " + fn);
  }
}

// ---- transactions ---------------------------------------------------------------------------------

type Pending = { fn: string; polls: number; result: Row; error: string; judged: boolean; settled: boolean };
const pending = new Map<string, Pending>();
let txCount = 0;
const fakeHash = () => "0x" + (++txCount).toString(16).padStart(8, "0") + "c10c4e5a".repeat(7);

/** Runs one call as `sender` and records it as a transaction; the hash comes back at once. */
function send(sender: string, fn: WriteFn, args: unknown[], value: bigint): string {
  if (value > balance(sender)) throw new Error("insufficient funds for this demo account");
  if (value > 0n) {
    credit(sender, -value);
    contractBalance += value;
  }
  let result: Row = {};
  let error = "";
  let settledRound = true;
  try {
    result = run(fn, args, { sender, value, now: mockNow() });
  } catch (e) {
    if (!(e instanceof Refused) && !(e instanceof NotSettled)) throw e;
    // A raised refusal changes nothing; no write that takes value raises, but the value goes back regardless.
    if (value > 0n) {
      contractBalance -= value;
      credit(sender, value);
    }
    error = e.message;
    settledRound = !(e instanceof NotSettled);
  }
  const hash = fakeHash();
  const judged = (fn === "deliver" && (!error || !settledRound)) || (fn === "say" && !error && result.verdict !== "noted");
  pending.set(hash, { fn, polls: 0, result, error, judged, settled: settledRound });
  notify();
  return hash;
}

export async function write(call: Call): Promise<string> {
  seed();
  await delay(250);
  return send(persona.toLowerCase(), call.fn, call.args, call.value ?? 0n);
}

const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];
const NO_VOTES = { agree: 0, disagree: 0, idle: 0 };

export async function txStatus(hash: string): Promise<TxStatus> {
  await delay(60);
  const p = pending.get(hash);
  if (!p) return { status: "UNKNOWN", votes: NO_VOTES, applied: null, undetermined: false, exec: null, result: null, message: "" };
  p.polls += 1;
  // A judged call asks every validator four questions (and for a delivery, fetches a page), so it moves slower.
  const stages = p.judged ? Math.max(1, Math.floor(p.polls / 2)) : p.polls;
  const done = stages >= STAGES.length;
  if (!p.settled) {
    // The page could not be read: every validator disagrees with a leader that raised, and the round
    // ends with no majority. Nothing is stored.
    const disagree = done ? 4 : Math.min(Math.max(0, stages - 2), 4);
    return {
      status: done ? "UNDETERMINED" : STAGES[Math.min(stages - 1, STAGES.length - 2)],
      votes: { agree: 0, disagree, idle: done || disagree ? 5 - disagree : 0 },
      applied: done ? false : null,
      undetermined: done,
      exec: done ? "ERROR" : null,
      result: null,
      message: done ? p.error : "",
    };
  }
  // Studio assigns five validators and one is often idle in a round; the mock shows the same shape.
  const agree = done ? 4 : p.judged ? Math.min(Math.max(0, stages - 2), 4) : 0;
  return {
    status: STAGES[Math.min(stages - 1, STAGES.length - 1)],
    votes: { agree, disagree: 0, idle: done || agree ? 5 - agree : 0 },
    applied: done ? true : null,
    undetermined: false,
    exec: done ? (p.error ? "ERROR" : "SUCCESS") : null,
    result: done && !p.error ? p.result : null,
    message: done ? p.error || JSON.stringify(p.result) : "",
  };
}

/** True once a transaction the mock knows has been polled to a final status (or it never existed). */
const isDone = (hash: string): boolean => {
  const p = pending.get(hash);
  if (!p) return true;
  return (p.judged ? Math.floor(p.polls / 2) : p.polls) >= STAGES.length;
};

export async function balanceOf(address: string): Promise<bigint> {
  await delay(40);
  return balance(address);
}

export async function faucet(address: string): Promise<bigint> {
  await delay(500);
  credit(address, 10n * GEN);
  return balance(address);
}

// ---- the demo maker --------------------------------------------------------------------------------

export function demoStatus(): DemoStatus {
  return { online: true, maker: DEMO_MAKER, studio: "S1", reason: "", drafts: true, draftsReason: "" };
}

/** The demo maker's last transaction per commission: it acts one move at a time. */
const lastDemoTx = new Map<string, string>();

function demoCommission(raw: string): { id: string; studio: string; status: string } | null {
  const id = pyStrip(String(raw ?? "")).slice(0, ID_CHARS);
  const c = commissionRows.get(id);
  return c ? { id, studio: c.studio_id, status: c.status } : null;
}

/** The in-memory twin of POST /api/demo/accept: the demo maker accepts a request made of its studio. */
export async function demoAccept(raw: string): Promise<DemoAnswer> {
  seed();
  await delay(300);
  const c = demoCommission(raw);
  const problem = demoActProblem(c, "S1", "accept", true);
  if (problem) return { ok: false, reason: problem };
  const last = lastDemoTx.get(c!.id);
  if (last && !isDone(last)) return { ok: false, reason: `the demo maker is still waiting for its last move on ${c!.id} to be final; try again once it is` };
  const hash = send(DEMO_MAKER, "accept", [c!.id], 0n);
  lastDemoTx.set(c!.id, hash);
  return { ok: true, hash };
}

/** The in-memory twin of POST /api/demo/act: the demo maker does one thing from its fixed script. */
export async function demoAct(raw: string, actionKey: string): Promise<DemoAnswer> {
  seed();
  await delay(300);
  const c = demoCommission(raw);
  const action = actionOf(actionKey);
  const problem = demoActProblem(c, "S1", action, true);
  if (problem) return { ok: false, reason: problem };
  const last = lastDemoTx.get(c!.id);
  if (last && !isDone(last)) return { ok: false, reason: `the demo maker is still waiting for its last move on ${c!.id} to be final; try again once it is` };
  const a = action!;
  const hash = a.kind === "say" ? send(DEMO_MAKER, "say", [c!.id, a.text], 0n) : send(DEMO_MAKER, "deliver", [c!.id, mockDraft(a.draft!), a.text], 0n);
  lastDemoTx.set(c!.id, hash);
  return { ok: true, hash };
}

// ---- seeding ---------------------------------------------------------------------------------------

let seeded = false;

/** Runs a call at a given instant, outside the transaction log: the seeded past. */
function at(sender: string, now: number, fn: WriteFn, args: unknown[], value = 0n): Row {
  if (value > 0n) {
    credit(sender, -value);
    contractBalance += value;
  }
  return run(fn, args, { sender, value, now });
}

const sayOf = (key: string) => DEMO_ACTIONS.find((a) => a.key === key)!.text;

function seed(): void {
  if (seeded) return;
  seeded = true;
  const now = mockNow();
  const MIN = 60;
  const HOUR = 3600;
  const DAY = 86400;
  const T = DEMO_TERMS;
  const D = DEMO_MAKER;
  const E = EARLIER_CLIENT;
  // S1, Fernhill Pottery copy desk: the demo studio on its demo terms.
  at(D, now - 6 * DAY, "open_studio", [DEMO_STUDIO_NAME, DEMO_ABOUT, T.feeAtto.toString(), T.makerSeconds, T.clientSeconds, T.stepSeconds, T.cutBps, T.maxCutBps]);
  // S2, the "You, a maker" persona's own studio: a gentler clock in hours and days.
  at(MY_MAKER, now - 7 * DAY, "open_studio", ["Larkspur Lettering", "Shop copy and wedding stationery wording, written to the word count.", GEN.toString(), 2 * DAY, DAY, HOUR, 500, 4000]);
  const fee = T.feeAtto;
  // C1: a whole commission that went right. The question passed the move, the answer passed it back,
  // the finished page was read on the web, and the client accepted: the maker was on time.
  let t = now - 3 * DAY;
  at(E, t, "request_commission", ["S1", DEMO_BRIEF], fee);
  at(D, t + 2 * MIN, "accept", ["C1"]);
  at(D, t + 4 * MIN, "say", ["C1", sayOf("question")]);
  at(E, t + 6 * MIN, "say", ["C1", "Sea-green, please."]);
  at(D, t + 14 * MIN, "deliver", ["C1", mockDraft("final"), "The finished description."]);
  at(E, t + 17 * MIN, "accept_work", ["C1"]);
  // C2: the maker stalled with a sham question and a promise, both kept on its clock; once the cut
  // reached its cap the client cancelled and had the whole fee back.
  t = now - 2 * DAY;
  at(E, t, "request_commission", ["S1", DEMO_BRIEF], fee);
  at(D, t + MIN, "accept", ["C2"]);
  at(E, t + 2 * MIN, "say", ["C2", "Thank you for taking this on. The mug goes in our autumn listing."]);
  at(D, t + 5 * MIN, "say", ["C2", sayOf("sham")]);
  at(D, t + 10 * MIN, "say", ["C2", sayOf("update")]);
  at(E, t + MIN + 1700, "cancel_late", ["C2"]);
  // C3: a placeholder read as missing, then the finished page; the client never reviewed it, so the
  // maker claimed its silence and was paid as if accepted.
  t = now - DAY;
  at(E, t, "request_commission", ["S1", DEMO_BRIEF], fee);
  at(D, t + MIN, "accept", ["C3"]);
  at(D, t + 3 * MIN, "deliver", ["C3", mockDraft("placeholder"), "First draft."]);
  at(D, t + 9 * MIN, "deliver", ["C3", mockDraft("final"), "The finished description."]);
  at(D, t + 9 * MIN + TURN_GRACE + T.clientSeconds + 60, "claim_silence", ["C3"]);
  // C4: a request to Larkspur Lettering, waiting for its maker to accept or decline.
  at(E, now - 2 * HOUR, "request_commission", ["S2", "Wording for a wedding invitation: two names, a date in June, a garden venue, and an RSVP line. Warm, not formal."], GEN);
  // C5: Larkspur Lettering delivered a day and more ago and the client has not answered: its maker may claim the silence.
  t = now - 3 * DAY;
  at(E, t, "request_commission", ["S2", DEMO_BRIEF], GEN);
  at(MY_MAKER, t + HOUR, "accept", ["C5"]);
  at(MY_MAKER, t + 30 * HOUR, "deliver", ["C5", mockDraft("final"), "Here it is, ready for your shop."]);
}

/** Test hook: the contract's held total and its own balance, which must be equal. */
export function mockHeld(): { held: bigint; balance: bigint } {
  seed();
  return { held: n.held_total, balance: contractBalance };
}

/** Test hook: the clock state of a commission, as the contract keeps it. */
export function mockClockOf(cid: string): (ClockState & { fee: bigint; deliveries: number; status: string }) | null {
  seed();
  const c = commissionRows.get(cid);
  return c ? { ...c, deliveries: c.n_deliveries } : null;
}

/** Every account the mock knows, for the tests' conservation checks. */
export const ACCOUNTS = [VISITOR, MY_MAKER, DEMO_MAKER, EARLIER_CLIENT, PASSER_BY];

/** Test hook: the running turn's charged seconds, to compare the mock's clock with the contract's. */
export const mockCharged = (cid: string, when: number): number => {
  const c = commissionRows.get(cid);
  return c ? charged(c, when) : -1;
};
