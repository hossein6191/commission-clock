// The demo studio and the demo maker who runs it, so one visitor's wallet can try everything as the
// client.
//
// Fernhill Pottery copy desk is opened once by a throwaway Studio key the site's server holds
// (DEMO_MAKER_KEY; tools/open-demo-studio.mjs), on short terms so the clock can be watched. A visitor
// commissions it with their own wallet and one of FOUR demo briefs, the jobs below; the demo maker
// picks the job by the commission's brief, word for word, accepts, and then does one of that job's
// FIXED list of things when the visitor presses its button: three messages and five deliveries of
// pages in drafts/, pinned to one commit of the public repository on raw.githubusercontent.com so
// every validator fetches the same bytes. A commission with any other brief gets nothing from it.
// Nothing a visitor types ever passes through the demo maker. Every studio, shop and person here is
// fictional. Pure, so node runs it in tests/unit.

import { ATTO, type DeliveryVerdict, type Holder, type MessageVerdict, type PressVerdict } from "./rules.ts";

export const DEMO_STUDIO_NAME = "Fernhill Pottery copy desk";
export const DEMO_ABOUT = "Product descriptions for hand-thrown stoneware, written by the potters who make it.";

/** The demo terms: 0.5 GEN; the maker 20 minutes, the client 10; 10% of the fee per started 2 minutes late, at most 50%. */
export const DEMO_TERMS = {
  feeAtto: ATTO / 2n,
  makerSeconds: 1200,
  clientSeconds: 600,
  stepSeconds: 120,
  cutBps: 1000,
  maxCutBps: 5000,
};

/** The first demo job's brief: the stoneware mug, the one the contract's own tests and the on-chain run use. */
export const DEMO_BRIEF =
  "A 150-word product description for a hand-thrown stoneware mug, 350 ml, for an online shop. Warm, plain English. Mention that it is dishwasher safe.";

const BAKERY_BRIEF =
  "A 120-word welcome email for new subscribers to the Larkrise Bakery newsletter. Friendly, plain English. Tell them what time the Saturday sourdough comes out of the oven, and how to unsubscribe.";

const CAFE_BRIEF =
  "Chalkboard menu for Tidepool Cafe: five drinks (espresso, flat white, hot chocolate, chai latte, mint tea) and three cakes (lemon drizzle, carrot cake, brownie), each on one short line with its price. Cheerful, plain English, under 100 words.";

const BIKE_BRIEF =
  "A 100-word About us paragraph for the website of Spokes & Sprockets, a small bike repair shop. Warm, plain English, one paragraph. Say how many years the shop has been open.";

/** The four demo jobs, by key. */
export type JobKey = "mug" | "bakery" | "cafe" | "bike";
export const JOB_KEYS: JobKey[] = ["mug", "bakery", "cafe", "bike"];

export type DraftKey = "placeholder" | "outline" | "wrong" | "final" | "revised";

export type Draft = {
  /** the demo job whose brief the page answers (or, for the wrong piece, fails) */
  job: JobKey;
  key: DraftKey;
  file: string;
  /** what the page is, in a few words */
  says: string;
  /** what the network should agree it is, against its job's brief */
  expect: DeliveryVerdict;
  /**
   * The demo build's fingerprint of the page: the first 16 hex characters of the sha256 of its text
   * with the spacing collapsed (tests/unit/demo.test.mjs recomputes it from drafts/). On chain every
   * validator fingerprints what it fetched itself.
   */
  fp: string;
};

/** Every page in drafts/, five per job, the mug's first. */
export const DRAFTS: Draft[] = [
  { job: "mug", key: "placeholder", file: "mug-placeholder.html", says: '"Draft coming soon."', expect: "missing", fp: "73903527c1f6a2b7" },
  { job: "mug", key: "outline", file: "mug-outline.html", says: "an outline in six bullet points", expect: "missing", fp: "79e04b63ff3c8d09" },
  { job: "mug", key: "wrong", file: "teapot.html", says: "a finished description of a teapot", expect: "missing", fp: "9b6a34ad97c9eaa5" },
  { job: "mug", key: "final", file: "mug-final.html", says: "the finished mug description", expect: "delivered", fp: "b9d43c8d6508c6f2" },
  { job: "mug", key: "revised", file: "mug-revised.html", says: "the mug description with a gift-wrapping line", expect: "delivered", fp: "bb05d8b80a5abdfd" },

  { job: "bakery", key: "placeholder", file: "bakery-placeholder.html", says: '"Welcome email: draft coming soon."', expect: "missing", fp: "00ebd0ee8b4d03de" },
  { job: "bakery", key: "outline", file: "bakery-outline.html", says: "an outline in six bullet points", expect: "missing", fp: "2dd024344eafc3a6" },
  { job: "bakery", key: "wrong", file: "bakery-job-advert.html", says: "a finished job advert for a weekend baker", expect: "missing", fp: "d1b937b46e3c0f2c" },
  { job: "bakery", key: "final", file: "bakery-final.html", says: "the finished welcome email, sourdough at 8 am", expect: "delivered", fp: "e3b739b0bc806533" },
  { job: "bakery", key: "revised", file: "bakery-revised.html", says: "the welcome email with a free-coffee line", expect: "delivered", fp: "154c4d2b9f08aca5" },

  { job: "cafe", key: "placeholder", file: "cafe-placeholder.html", says: '"Chalkboard menu: draft coming soon."', expect: "missing", fp: "333c754db1723247" },
  { job: "cafe", key: "outline", file: "cafe-outline.html", says: "an outline in five bullet points", expect: "missing", fp: "8b46ac3da962dfd8" },
  { job: "cafe", key: "wrong", file: "cafe-quiz-night.html", says: "a finished poster for the cafe's quiz night", expect: "missing", fp: "f0d1a5d3268b419f" },
  { job: "cafe", key: "final", file: "cafe-final.html", says: "the finished menu, eight lines with prices", expect: "delivered", fp: "3dd6041ec26ab701" },
  { job: "cafe", key: "revised", file: "cafe-revised.html", says: "the menu with an oat milk line", expect: "delivered", fp: "ccc1892908dae3c6" },

  { job: "bike", key: "placeholder", file: "bike-placeholder.html", says: '"About us: draft coming soon."', expect: "missing", fp: "14f7c2721799b0d2" },
  { job: "bike", key: "outline", file: "bike-outline.html", says: "an outline in five bullet points", expect: "missing", fp: "0daf583bc82ed623" },
  { job: "bike", key: "wrong", file: "bike-puncture-guide.html", says: "a finished guide to fixing a puncture", expect: "missing", fp: "c868d1c466e064e9" },
  { job: "bike", key: "final", file: "bike-final.html", says: "the finished paragraph, fifteen years open", expect: "delivered", fp: "3aaffeaea3bf0ab0" },
  { job: "bike", key: "revised", file: "bike-revised.html", says: "the paragraph with a wheelchairs and prams line", expect: "delivered", fp: "7186ed3703cbd05a" },
];

/** One job's draft by its key. */
export const draftOf = (key: DraftKey, job: JobKey): Draft => DRAFTS.find((d) => d.job === job && d.key === key)!;

/** "owner/name" from a GitHub repository URL; "" when it is not one. */
export function repoOf(url: string): string {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(String(url ?? "").trim());
  return m ? m[1] : "";
}

/** The pinned base every demo draft address starts with. */
export const rawBase = (repo: string, commit: string): string => `https://raw.githubusercontent.com/${repo}/${commit}/drafts/`;

/** The pinned address of one draft. */
export const draftUrl = (repo: string, commit: string, file: string): string => rawBase(repo, commit) + file;

/** The draft an address names, read from its last segment below drafts/; null for any other address. */
export function draftOfUrl(url: string): Draft | null {
  const m = /\/drafts\/([a-z0-9-]+\.html)$/.exec(String(url ?? ""));
  if (!m) return null;
  return DRAFTS.find((d) => d.file === m[1]) ?? null;
}

// ---- the demo maker's fixed scripts, one per job --------------------------------------------------

export type ActionKey = "question" | "sham" | "update" | DraftKey;

/** The same eight keys in every job, in this order: the act route takes one of them and nothing else. */
export const ACTION_KEYS: ActionKey[] = ["question", "sham", "update", "placeholder", "outline", "wrong", "final", "revised"];

export type DemoAction = {
  job: JobKey;
  key: ActionKey;
  kind: "say" | "deliver";
  /** the button */
  label: string;
  /** what the maker writes: the message, or the delivery's note */
  text: string;
  /** the draft a delivery points at (of the same job) */
  draft?: DraftKey;
  /** what the network should reach when the maker holds the move */
  expect: PressVerdict | DeliveryVerdict;
  /** why, in one line */
  why: string;
};

const PROMISE = "a promise is not material: the move stays with the maker";
const PLACEHOLDER_WHY = "the page only says a draft is coming";

const MUG_ACTIONS: DemoAction[] = [
  {
    job: "mug",
    key: "question",
    kind: "say",
    label: "Ask which glaze to name",
    text: "Which glaze should the description name? We make this mug in sea-green, oatmeal and charcoal, and the brief does not say which one this listing is for, so I need you to choose before I write it.",
    expect: "pass",
    why: "a real question the brief leaves open: the maker cannot go on without your answer",
  },
  {
    job: "mug",
    key: "sham",
    kind: "say",
    label: "Ask whether to write in English",
    text: "Should the description be written in English?",
    expect: "keep",
    why: "the brief already says plain English: a sham question does not stop the maker's clock",
  },
  { job: "mug", key: "update", kind: "say", label: "Send a progress update", text: "Working on it, nearly there.", expect: "keep", why: PROMISE },
  { job: "mug", key: "placeholder", kind: "deliver", draft: "placeholder", label: "Deliver a placeholder page", text: "First draft.", expect: "missing", why: PLACEHOLDER_WHY },
  { job: "mug", key: "outline", kind: "deliver", draft: "outline", label: "Deliver an outline", text: "Here is the outline.", expect: "missing", why: "bullet points are not the finished description" },
  { job: "mug", key: "wrong", kind: "deliver", draft: "wrong", label: "Deliver the wrong piece (a teapot)", text: "Here is the description.", expect: "missing", why: "finished, but about a teapot, not the mug" },
  { job: "mug", key: "final", kind: "deliver", draft: "final", label: "Deliver the finished description", text: "The finished description.", expect: "delivered", why: "the whole mug description, ready for your review" },
  {
    job: "mug",
    key: "revised",
    kind: "deliver",
    draft: "revised",
    label: "Deliver the revised description",
    text: "Revised with a line about gift wrapping.",
    expect: "delivered",
    why: "the finished description with the gift-wrapping line added",
  },
];

const BAKERY_ACTIONS: DemoAction[] = [
  {
    job: "bakery",
    key: "question",
    kind: "say",
    label: "Ask what time the sourdough is ready",
    text: "What time does the Saturday sourdough come out of the oven? The brief asks me to tell subscribers, but it does not give the time, and I cannot promise one the bakery might not keep, so I need you to tell me before I write the email.",
    expect: "pass",
    why: "a real question the brief leaves open: the email cannot give a time nobody has told the maker",
  },
  {
    job: "bakery",
    key: "sham",
    kind: "say",
    label: "Ask how long the email should be",
    text: "How long should the welcome email be?",
    expect: "keep",
    why: "the brief already says 120 words: a sham question does not stop the maker's clock",
  },
  { job: "bakery", key: "update", kind: "say", label: "Send a progress update", text: "Halfway through the email, more soon.", expect: "keep", why: PROMISE },
  { job: "bakery", key: "placeholder", kind: "deliver", draft: "placeholder", label: "Deliver a placeholder page", text: "First draft.", expect: "missing", why: PLACEHOLDER_WHY },
  { job: "bakery", key: "outline", kind: "deliver", draft: "outline", label: "Deliver an outline", text: "Here is the outline.", expect: "missing", why: "bullet points are not the finished email" },
  { job: "bakery", key: "wrong", kind: "deliver", draft: "wrong", label: "Deliver the wrong piece (a job advert)", text: "Here is the email.", expect: "missing", why: "finished, but a job advert for a baker, not the welcome email" },
  { job: "bakery", key: "final", kind: "deliver", draft: "final", label: "Deliver the finished email", text: "The finished welcome email.", expect: "delivered", why: "the whole welcome email, ready for your review" },
  { job: "bakery", key: "revised", kind: "deliver", draft: "revised", label: "Deliver the revised email", text: "Revised with the free coffee line.", expect: "delivered", why: "the finished email with the free-coffee line added" },
];

const CAFE_ACTIONS: DemoAction[] = [
  {
    job: "cafe",
    key: "question",
    kind: "say",
    label: "Ask for the prices",
    text: "What price goes after each drink and cake? The brief asks for a price on every line but gives none, and I cannot invent the cafe's prices, so please send me all eight before I write the board.",
    expect: "pass",
    why: "a real question the brief leaves open: only the cafe knows its prices",
  },
  {
    job: "cafe",
    key: "sham",
    kind: "say",
    label: "Ask what tone to use",
    text: "What tone should the menu lines have?",
    expect: "keep",
    why: "the brief already says cheerful: a sham question does not stop the maker's clock",
  },
  { job: "cafe", key: "update", kind: "say", label: "Send a progress update", text: "The board is coming along nicely.", expect: "keep", why: PROMISE },
  { job: "cafe", key: "placeholder", kind: "deliver", draft: "placeholder", label: "Deliver a placeholder page", text: "First draft.", expect: "missing", why: PLACEHOLDER_WHY },
  { job: "cafe", key: "outline", kind: "deliver", draft: "outline", label: "Deliver an outline", text: "Here is the outline.", expect: "missing", why: "bullet points are not the finished menu" },
  { job: "cafe", key: "wrong", kind: "deliver", draft: "wrong", label: "Deliver the wrong piece (a quiz night poster)", text: "Here is the board.", expect: "missing", why: "finished, but a quiz night poster, not the menu" },
  { job: "cafe", key: "final", kind: "deliver", draft: "final", label: "Deliver the finished menu", text: "The finished menu.", expect: "delivered", why: "all eight lines with their prices, ready for your review" },
  { job: "cafe", key: "revised", kind: "deliver", draft: "revised", label: "Deliver the revised menu", text: "Revised with the oat milk line.", expect: "delivered", why: "the finished menu with the oat milk line added" },
];

const BIKE_ACTIONS: DemoAction[] = [
  {
    job: "bike",
    key: "question",
    kind: "say",
    label: "Ask how long the shop has been open",
    text: "How many years has the shop been open? The brief asks me to say, but it does not give the year you opened, and I cannot guess it, so I need the number before I write the paragraph.",
    expect: "pass",
    why: "a real question the brief leaves open: only the shop knows when it opened",
  },
  {
    job: "bike",
    key: "sham",
    kind: "say",
    label: "Ask whether to use several paragraphs",
    text: "Should the About us text be split into several paragraphs?",
    expect: "keep",
    why: "the brief already says one paragraph: a sham question does not stop the maker's clock",
  },
  { job: "bike", key: "update", kind: "say", label: "Send a progress update", text: "Still writing, I will send it shortly.", expect: "keep", why: PROMISE },
  { job: "bike", key: "placeholder", kind: "deliver", draft: "placeholder", label: "Deliver a placeholder page", text: "First draft.", expect: "missing", why: PLACEHOLDER_WHY },
  { job: "bike", key: "outline", kind: "deliver", draft: "outline", label: "Deliver an outline", text: "Here is the outline.", expect: "missing", why: "bullet points are not the finished paragraph" },
  { job: "bike", key: "wrong", kind: "deliver", draft: "wrong", label: "Deliver the wrong piece (a puncture guide)", text: "Here is the paragraph.", expect: "missing", why: "finished, but a guide to mending a puncture, not the About us paragraph" },
  { job: "bike", key: "final", kind: "deliver", draft: "final", label: "Deliver the finished paragraph", text: "The finished paragraph.", expect: "delivered", why: "the whole About us paragraph, ready for your review" },
  {
    job: "bike",
    key: "revised",
    kind: "deliver",
    draft: "revised",
    label: "Deliver the revised paragraph",
    text: "Revised with the wheelchairs and prams line.",
    expect: "delivered",
    why: "the finished paragraph with the wheelchairs and prams line added",
  },
];

/** A client's message the demo build knows, with what the network should make of it while the client holds the move. */
export type ClientLine = { text: string; expect: PressVerdict };

/** "I'll get back to you": the same words, and the same verdict, in every job. */
export const LATER = "I'll get back to you on that.";

export type DemoJob = {
  key: JobKey;
  /** the job in a few words, for its brief chip */
  title: string;
  /** the brief, word for word: a commission of the demo studio with exactly this brief is this job */
  brief: string;
  /** the one thing the brief leaves open, which only the maker's real question settles */
  open: string;
  /** what the brief already says that the sham question asks about */
  stated: string;
  drafts: Draft[];
  /** the eight moves, in ACTION_KEYS order */
  actions: DemoAction[];
  /** the client's lines the demo build knows for this job */
  lines: ClientLine[];
};

const draftsOf = (job: JobKey): Draft[] => DRAFTS.filter((d) => d.job === job);

/** The four demo jobs, the mug first. */
export const DEMO_JOBS: DemoJob[] = [
  {
    key: "mug",
    title: "The stoneware mug",
    brief: DEMO_BRIEF,
    open: "which glaze the listing is for",
    stated: "plain English",
    drafts: draftsOf("mug"),
    actions: MUG_ACTIONS,
    lines: [
      { text: "Sea-green, please.", expect: "pass" },
      { text: "Oatmeal, please. It is the autumn colour.", expect: "pass" },
      { text: LATER, expect: "keep" },
      { text: "Please add one line saying it can be gift wrapped at checkout.", expect: "pass" },
      { text: "Looks lovely, thank you.", expect: "keep" },
      { text: "Can you make it pop a bit more?", expect: "unclear" },
    ],
  },
  {
    key: "bakery",
    title: "A bakery's welcome email",
    brief: BAKERY_BRIEF,
    open: "what time the Saturday sourdough comes out of the oven",
    stated: "120-word",
    drafts: draftsOf("bakery"),
    actions: BAKERY_ACTIONS,
    lines: [
      { text: "At 8 am, and it stays on the shelves until it sells out.", expect: "pass" },
      { text: LATER, expect: "keep" },
      { text: "Please add one line saying new subscribers get a free coffee with their first loaf.", expect: "pass" },
      { text: "That reads beautifully, thank you.", expect: "keep" },
      { text: "Could it feel a bit more special?", expect: "unclear" },
    ],
  },
  {
    key: "cafe",
    title: "A cafe's chalkboard menu",
    brief: CAFE_BRIEF,
    open: "the eight prices",
    stated: "Cheerful",
    drafts: draftsOf("cafe"),
    actions: CAFE_ACTIONS,
    lines: [
      { text: "Espresso 2.50, flat white 3.20, hot chocolate 3.40, chai latte 3.40, mint tea 2.80, lemon drizzle 3.00, carrot cake 3.50, brownie 2.90.", expect: "pass" },
      { text: LATER, expect: "keep" },
      { text: "Please add a last line saying oat milk is free in any drink.", expect: "pass" },
      { text: "Perfect, that will look great on the board.", expect: "keep" },
      { text: "Can it be a bit more fun?", expect: "unclear" },
    ],
  },
  {
    key: "bike",
    title: "A bike shop's About us",
    brief: BIKE_BRIEF,
    open: "how many years the shop has been open",
    stated: "one paragraph",
    drafts: draftsOf("bike"),
    actions: BIKE_ACTIONS,
    lines: [
      { text: "Fifteen years. We opened in the spring of 2011.", expect: "pass" },
      { text: LATER, expect: "keep" },
      { text: "Please add that we fix wheelchairs and prams too.", expect: "pass" },
      { text: "Spot on, thank you.", expect: "keep" },
      { text: "Could it have a bit more personality?", expect: "unclear" },
    ],
  },
];

export const jobOf = (key: JobKey): DemoJob => DEMO_JOBS.find((j) => j.key === key)!;

/** The demo job a brief is, compared word for word as the contract stored it; null for any other brief. */
export const jobOfBrief = (brief: string): DemoJob | null => DEMO_JOBS.find((j) => j.brief === brief) ?? null;

export const isActionKey = (what: string): what is ActionKey => (ACTION_KEYS as string[]).includes(what);

/** One job's move by its key; null for anything that is not one of the eight keys. */
export const actionOf = (key: string, job: JobKey): DemoAction | null => jobOf(job).actions.find((a) => a.key === key) ?? null;

/** The move the demo maker makes for a key on a commission with this brief; null when the brief is not a demo job's. */
export function demoActionFor(brief: string, key: string): DemoAction | null {
  const job = jobOfBrief(brief);
  return job ? actionOf(key, job.key) : null;
}

/** What the network should reach for one action given who holds the move now; noted for a message while the client holds it. */
export function expectedVerdict(a: DemoAction, holder: Holder): MessageVerdict {
  if (a.kind === "say" && holder !== "maker") return "noted";
  return a.expect;
}

/** Where the move should be after the action, given who holds it now. */
export function expectedHolder(a: DemoAction, holder: Holder): Holder {
  const v = expectedVerdict(a, holder);
  if (holder === "maker" && (v === "pass" || v === "delivered")) return "client";
  return holder;
}

/** True when a studio is the demo studio: its maker is the demo key's address and its name is the demo name. */
export function isDemoStudio(studio: { maker: string; name: string }, demoMaker: string): boolean {
  return !!demoMaker && studio.maker.toLowerCase() === demoMaker.toLowerCase() && studio.name === DEMO_STUDIO_NAME;
}

/** Why the demo maker does nothing on a commission of its studio whose brief is not one of its jobs. */
export function offScript(id: string, accept: boolean): string {
  const why = `${id}'s brief is not one of the ${DEMO_JOBS.length} demo briefs word for word, so the demo maker has no script and no drafts for it`;
  return accept ? `${why} and does not accept it; withdrawing it returns the whole fee` : why;
}

/**
 * Why the demo maker will not act on this commission now, in words a visitor can act on; "" when it
 * will. `what` is "accept" or one of the eight action keys; the job is the commission's brief, word
 * for word. The server asks this of a fresh read before it signs, and so does the mock.
 */
export function demoActProblem(c: { id: string; studio: string; status: string; brief: string } | null, demoStudio: string, what: string, drafts: boolean): string {
  if (!demoStudio) return "the demo studio is not open on this contract yet";
  if (what !== "accept" && !isActionKey(what)) return "the demo maker does only what its buttons say";
  if (!c) return "there is no such commission";
  if (c.studio !== demoStudio) return `${c.id} is not a commission of the demo studio; only its own maker acts on it`;
  const job = jobOfBrief(c.brief);
  if (!job) return offScript(c.id, what === "accept");
  if (what === "accept") {
    if (c.status !== "requested") return `${c.id} is ${c.status}; the demo maker accepts only a request`;
    return "";
  }
  if (c.status !== "active") return `${c.id} is ${c.status}; the demo maker acts only on an active commission`;
  if (actionOf(what, job.key)!.kind === "deliver" && !drafts) return "the demo drafts are not pinned to a commit of the public repository yet, so the demo maker can talk but not deliver";
  return "";
}

// ---- the scripted reader of mock mode -------------------------------------------------------------

export const FETCH_FAILED = "[TRANSIENT] the page could not be fetched; nothing was stored, and the delivery may be made again";

/**
 * What the in-memory contract of mock mode agrees on for a press, in place of the validators: on a
 * demo job's commission, that job's three maker messages and its client lines are read as the demo
 * expects. On any other brief every job's lines are known (a line in several jobs has one verdict
 * everywhere). Any other message lands unclear here, where on chain every validator asks its own model.
 */
export function scriptedPress(text: string, brief = ""): PressVerdict {
  const job = jobOfBrief(brief);
  for (const j of job ? [job] : DEMO_JOBS) {
    const maker = j.actions.find((a) => a.kind === "say" && a.text === text);
    if (maker) return maker.expect as PressVerdict;
    const line = j.lines.find((l) => l.text === text);
    if (line) return line.expect;
  }
  return "unclear";
}

/**
 * What the mock agrees on for a delivered page: a demo draft as the demo expects, except that on a demo
 * job's commission another job's page is about something else and is read as missing; any other
 * address cannot be fetched and stores nothing.
 */
export function scriptedDelivery(url: string, brief = ""): { verdict: DeliveryVerdict; fp: string } | { error: string } {
  const d = draftOfUrl(url);
  if (!d) return { error: FETCH_FAILED };
  const job = jobOfBrief(brief);
  return { verdict: job && d.job !== job.key ? "missing" : d.expect, fp: d.fp };
}
