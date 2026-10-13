// The contract's rules, in TypeScript, with no imports: the limits, the askings, the words it stores,
// and the readers of the caller's arguments. The in-memory contract of mock mode (lib/chain-mock.ts)
// is built on these, the forms check against them before anything is signed, and tests/unit runs them
// from node with no browser, against contracts/commission_clock.py itself.
//
// Every refusal sentence here is the contract's own, word for word, so a form, the mock and the chain
// all say the same thing about the same input.

export const ATTO = 10n ** 18n;
export const BPS = 10000;
export const MIN_FEE = ATTO / 10n;
export const MAX_FEE = 100n * ATTO;
export const MIN_MAKER_SECONDS = 600;
export const MAX_MAKER_SECONDS = 60 * 86400;
export const MIN_CLIENT_SECONDS = 300;
export const MAX_CLIENT_SECONDS = 30 * 86400;
export const MIN_STEP = 60;
export const MAX_STEP = 7 * 86400;
export const MIN_CUT_BPS = 1;
export const MAX_CUT_BPS = 2500;
export const MIN_MAX_CUT_BPS = 100;
export const MAX_MAX_CUT_BPS = 9000;
export const MAX_TO_CAP = 30 * 86400;
export const KILL_BPS = 2500;
export const TURN_GRACE = 300;
export const TURN_NOTICE = 300;
export const ACCEPT_WINDOW = 7 * 86400;
export const MIN_NAME = 3;
export const MAX_NAME = 60;
export const MAX_ABOUT = 300;
export const MIN_BRIEF = 40;
export const MAX_BRIEF = 800;
export const MIN_TEXT = 1;
export const MAX_TEXT = 600;
export const MAX_URL = 200;
export const MAX_NOTE = 300;
export const THREAD_WINDOW = 6;
export const THREAD_GAP = "(earlier messages left out)";
export const MAX_PAGE_TEXT = 8000;
export const MAX_RAW_PAGE = 4 * MAX_PAGE_TEXT;
export const FP_CHARS = 16;
export const PAGE = 20;
export const ID_CHARS = 16;
export const ADDRESS_CHARS = 42;

export const SCHEME = "https://";
export const URL_SIGNS = ["-", ".", "_", "~", "/", "?", "&", "=", "%", "+", ":", "@"];
export const HOST_SIGNS = ["-", "."];

// ---- the askings, in the contract's words -------------------------------------------------------------

export const QUESTION_HAND =
  "After this new message from the {holder}, is the {holder} now waiting for something only the {other} can give " +
  "(an answer, a decision, material, or a review) that this message actually asks for or hands over? Answer yes, " +
  "no or unclear.";
export const QUESTION_CARRY = "After this new message from the {holder}, can the {holder} still carry on without waiting for the {other}? " + "Answer yes, no or unclear.";
export const QUESTION_THERE =
  "Does this page contain the finished piece the brief asks for, the actual work complete enough for the client " +
  "to review, rather than a placeholder, an outline, a promise, a fragment or something else? Answer yes, no or " +
  "unclear.";
export const QUESTION_MISSING =
  "Is the work the brief asks for missing from this page: the page is empty, a placeholder, only an outline or a " +
  "part, or about something else? Answer yes, no or unclear.";
export const PRESS_RULES =
  "Rules: a question the brief or the thread already answers, or one the {holder} could reasonably decide alone, " +
  "does not make them wait; a promise, a progress update, thanks or praise does not hand over the move; saying the " +
  "work is done without the work does not hand it over (deliveries go through deliver); concrete answers, " +
  "material or specific revisions do hand it over; \"I'll get back to you\" keeps it.";
export const READING =
  "The PAGE is the text of a web page with its spacing collapsed, and any markup in it is shown in round " +
  "brackets; read it as a visitor would see the page, and judge only what the PAGE itself contains.";

/** The side words put into a constant, as the contract's _words does. Never applied to what a party wrote. */
export const sideWords = (constant: string, holder: Side): string => constant.split("{holder}").join(holder).split("{other}").join(other(holder));

// ---- the words the contract stores --------------------------------------------------------------------

export type Side = "maker" | "client";
/** maker, client, or "" while no clock runs */
export type Holder = Side | "";
export type PressVerdict = "pass" | "keep" | "unclear";
export type DeliveryVerdict = "delivered" | "missing" | "unclear";
export type MessageVerdict = "noted" | "pass" | "keep" | "unclear" | "delivered" | "missing" | "taken";
export type MessageKind = "say" | "deliver" | "take";
export type CommissionStatus = "requested" | "active" | "accepted" | "accepted_by_silence" | "lapsed" | "cancelled_late" | "withdrawn" | "declined";

export const PRESS_WORDS: PressVerdict[] = ["pass", "keep", "unclear"];
export const DELIVERY_WORDS: DeliveryVerdict[] = ["delivered", "missing", "unclear"];
export const MESSAGE_VERDICTS: MessageVerdict[] = ["noted", "pass", "keep", "unclear", "delivered", "missing", "taken"];
export const MESSAGE_KINDS: MessageKind[] = ["say", "deliver", "take"];
export const STATUSES: CommissionStatus[] = ["requested", "active", "accepted", "accepted_by_silence", "lapsed", "cancelled_late", "withdrawn", "declined"];
/** The statuses a commission ends in: the fee has been paid out. */
export const SETTLED: CommissionStatus[] = ["accepted", "accepted_by_silence", "lapsed", "cancelled_late", "withdrawn", "declined"];
export const isSettled = (s: CommissionStatus): boolean => SETTLED.includes(s);

/** The contract's _other: the other side's word. */
export const other = (side: Side): Side => (side === "client" ? "maker" : "client");

// ---- reading the caller, as the contract does -----------------------------------------------------

/** The characters Python's str.strip() treats as whitespace (str.isspace()). */
const PY_SPACE_CHARS = "\t\n\x0b\x0c\r\x1c\x1d\x1e\x1f \x85\xa0                　";

/** Python's str.strip(): JS trim() also takes U+FEFF and misses \x1c-\x1f and \x85. */
export function pyStrip(text: string): string {
  let a = 0;
  let b = text.length;
  while (a < b && PY_SPACE_CHARS.includes(text[a])) a++;
  while (b > a && PY_SPACE_CHARS.includes(text[b - 1])) b--;
  return text.slice(a, b);
}

const isAscii = (t: string) => /^[\x00-\x7f]*$/.test(t);

/** The contract's _text_problem: "" when the text may be stored, else why not. Printable ASCII on one line. */
export function textProblem(text: string, least: number, most: number, what: string): string {
  // Python counts code points; a JS string's length counts UTF-16 units.
  const n = [...text].length;
  if (n < least || n > most) return what + " is " + least + " to " + most + " characters; this one is " + n;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 || c > 126) return what + " is printable ASCII on one line";
  }
  return "";
}

/** The contract's _url_problem: https, a lowercase host with a dot, a plain path and query. */
export function urlProblem(url: string): string {
  const n = [...url].length;
  if (n > MAX_URL) return "the page address is at most " + MAX_URL + " characters; this one is " + n;
  if (!url.startsWith(SCHEME)) return "the page address starts with " + SCHEME;
  const rest = url.slice(SCHEME.length);
  let bare = rest;
  for (const sign of URL_SIGNS) bare = bare.split(sign).join("");
  if (!isAscii(rest) || !(bare === "" || /^[A-Za-z0-9]+$/.test(bare)))
    return "the page address uses only letters, digits and - . _ ~ / ? & = % + : @ after " + SCHEME;
  const host = rest.split("/")[0].split("?")[0];
  let plainHost = host;
  for (const sign of HOST_SIGNS) plainHost = plainHost.split(sign).join("");
  if (!host.includes(".") || host !== host.toLowerCase() || host.startsWith(".") || host.endsWith(".") || !/^[A-Za-z0-9]+$/.test(plainHost))
    return "the page address names a lowercase host such as studio.example, then a path";
  return "";
}

/** The contract's _number_arg: an int, or a string of at most 40 ASCII digits; -1 otherwise (a bool is refused by name). */
export function numberArg(raw: unknown): bigint {
  if (typeof raw === "boolean") return -1n;
  if (typeof raw === "bigint") return raw >= 0n ? raw : -1n;
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw >= 0 ? BigInt(raw) : -1n;
  if (typeof raw === "string") {
    const s = pyStrip(raw);
    return s.length <= 40 && /^[0-9]+$/.test(s) ? BigInt(s) : -1n;
  }
  return -1n;
}

/** The contract's _steps_to_cap: how many started steps late bring the cut to its cap. */
export const stepsToCap = (cutBps: number, maxCutBps: number): number => Math.floor((maxCutBps + cutBps - 1) / cutBps);

export type Terms = { feeAtto: bigint; makerSeconds: number; clientSeconds: number; stepSeconds: number; cutBps: number; maxCutBps: number };

/** open_studio's checks of the name, after the strip. */
export const nameProblem = (name: string): string => textProblem(pyStrip(name), MIN_NAME, MAX_NAME, "the name");

/** open_studio's checks of the about line, after the strip. */
export const aboutProblem = (about: string): string => textProblem(pyStrip(about), 0, MAX_ABOUT, "the about line");

/** open_studio's checks of the terms, in the contract's order: "" when they may be opened, else the first problem. */
export function termsProblem(t: { fee: bigint; maker: bigint; client: bigint; step: bigint; cut: bigint; cap: bigint }): string {
  if (t.fee < MIN_FEE || t.fee > MAX_FEE) return "the fee is a whole number of atto from " + MIN_FEE + " (0.1 GEN) to " + MAX_FEE + " (100 GEN)";
  if (t.maker < BigInt(MIN_MAKER_SECONDS) || t.maker > BigInt(MAX_MAKER_SECONDS))
    return "the maker's allowance is " + MIN_MAKER_SECONDS + " to " + MAX_MAKER_SECONDS + " seconds";
  if (t.client < BigInt(MIN_CLIENT_SECONDS) || t.client > BigInt(MAX_CLIENT_SECONDS))
    return "the client's allowance is " + MIN_CLIENT_SECONDS + " to " + MAX_CLIENT_SECONDS + " seconds";
  if (t.step < BigInt(MIN_STEP) || t.step > BigInt(MAX_STEP)) return "a step of lateness is " + MIN_STEP + " to " + MAX_STEP + " seconds";
  if (t.cut < BigInt(MIN_CUT_BPS) || t.cut > BigInt(MAX_CUT_BPS)) return "the cut per started step is " + MIN_CUT_BPS + " to " + MAX_CUT_BPS + " basis points";
  if (t.cap < BigInt(MIN_MAX_CUT_BPS) || t.cap > BigInt(MAX_MAX_CUT_BPS)) return "the cap on the cut is " + MIN_MAX_CUT_BPS + " to " + MAX_MAX_CUT_BPS + " basis points";
  if (t.cap < t.cut) return "the cap on the cut is at least the cut per step";
  const take = BigInt(stepsToCap(Number(t.cut), Number(t.cap))) * t.step;
  if (take > BigInt(MAX_TO_CAP))
    return (
      "the cut must reach its cap within " + MAX_TO_CAP + " seconds of the maker's allowance running " +
      "out, so a client whose maker goes silent can always cancel; these terms take " + take
    );
  return "";
}

/** The same checks on the site's own terms shape. */
export const termsOfProblem = (t: Terms): string =>
  termsProblem({ fee: t.feeAtto, maker: BigInt(Math.trunc(t.makerSeconds)), client: BigInt(Math.trunc(t.clientSeconds)), step: BigInt(Math.trunc(t.stepSeconds)), cut: BigInt(Math.trunc(t.cutBps)), cap: BigInt(Math.trunc(t.maxCutBps)) });

/** request_commission's check of the brief, after the strip. */
export const briefProblem = (brief: string): string => textProblem(pyStrip(brief), MIN_BRIEF, MAX_BRIEF, "the brief");

/** say's check of a message, after the strip. */
export const messageProblem = (text: string): string => textProblem(pyStrip(text), MIN_TEXT, MAX_TEXT, "a message");

/** deliver's checks of the page address and the note, after the strip. */
export const deliveryProblem = (url: string, note: string): string => urlProblem(pyStrip(url)) || textProblem(pyStrip(note), 0, MAX_NOTE, "the note");

// ---- what the site sends --------------------------------------------------------------------------

const TYPOGRAPHIC: [string, string][] = [
  ["‘", "'"],
  ["’", "'"],
  ["“", '"'],
  ["”", '"'],
  ["–", "-"],
  ["—", "-"],
  ["…", "..."],
  [" ", " "],
];

/**
 * A text as a form sends it: typographic quotes, dashes and the ellipsis made plain, and every run of
 * whitespace, line breaks included, turned into one space. The contract itself only strips the ends;
 * this is what keeps a pasted message on one line of printable ASCII.
 */
export function plain(text: string): string {
  let t = String(text ?? "");
  for (const [fancy, plainChar] of TYPOGRAPHIC) t = t.split(fancy).join(plainChar);
  return t
    .split(/[\s\x1c-\x1f\x85]+/)
    .filter(Boolean)
    .join(" ");
}

/** A contract sentence as a sentence: capital first letter, full stop at the end, the error tag dropped. */
export function sentence(text: string): string {
  const t = String(text ?? "")
    .replace(/^\s*\[(EXPECTED|TRANSIENT|LLM_ERROR)\]\s*/i, "")
    .trim();
  if (!t) return "";
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?)]$/.test(s) ? s : s + ".";
}

export type IdPrefix = "S" | "C";

/** "C3" from "C3", "c3" or "3" (for prefix "C"); "" for anything else. */
export function parseId(prefix: IdPrefix, raw: string): string {
  let text = "";
  try {
    text = decodeURIComponent(String(raw ?? "")).trim();
  } catch {
    return "";
  }
  const m = new RegExp(`^${prefix}?([1-9]\\d{0,8})$`, "i").exec(text);
  return m ? prefix + m[1] : "";
}
export const parseStudioId = (raw: string) => parseId("S", raw);
export const parseCommissionId = (raw: string) => parseId("C", raw);

/** The number inside an id: 3 for "C3"; 0 when there is none. */
export const idNumber = (id: string): number => Number(/^[SC]([1-9]\d{0,8})$/.exec(id)?.[1] ?? 0);
