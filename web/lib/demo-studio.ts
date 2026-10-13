// The demo studio and the demo maker who runs it, so one visitor's wallet can try everything as the
// client.
//
// Fernhill Pottery copy desk is opened once by a throwaway Studio key the site's server holds
// (DEMO_MAKER_KEY; tools/open-demo-studio.mjs), on short terms so the clock can be watched. A visitor
// commissions it with their own wallet and the brief below; the demo maker accepts, and then does
// one of a FIXED list of things when the visitor presses its button: three messages and five
// deliveries of pages in drafts/, pinned to one commit of the public repository on
// raw.githubusercontent.com so every validator fetches the same bytes. Nothing a visitor types ever
// passes through the demo maker. Every studio, shop and person here is fictional. Pure, so node runs
// it in tests/unit.

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

/** The brief the demo maker's drafts answer, and the one the brief chip fills in. */
export const DEMO_BRIEF =
  "A 150-word product description for a hand-thrown stoneware mug, 350 ml, for an online shop. Warm, plain English. Mention that it is dishwasher safe.";

export type DraftKey = "placeholder" | "outline" | "wrong" | "final" | "revised";

export type Draft = {
  key: DraftKey;
  file: string;
  /** what the page is, in a few words */
  says: string;
  /** what the network should agree it is, against the demo brief */
  expect: DeliveryVerdict;
  /**
   * The demo build's fingerprint of the page: the first 16 hex characters of the sha256 of its text
   * with the spacing collapsed (tests/unit/demo.test.mjs recomputes it from drafts/). On chain every
   * validator fingerprints what it fetched itself.
   */
  fp: string;
};

export const DRAFTS: Draft[] = [
  { key: "placeholder", file: "mug-placeholder.html", says: '"Draft coming soon."', expect: "missing", fp: "73903527c1f6a2b7" },
  { key: "outline", file: "mug-outline.html", says: "an outline in six bullet points", expect: "missing", fp: "79e04b63ff3c8d09" },
  { key: "wrong", file: "teapot.html", says: "a finished description of a teapot", expect: "missing", fp: "9b6a34ad97c9eaa5" },
  { key: "final", file: "mug-final.html", says: "the finished mug description", expect: "delivered", fp: "b9d43c8d6508c6f2" },
  { key: "revised", file: "mug-revised.html", says: "the mug description with a gift-wrapping line", expect: "delivered", fp: "bb05d8b80a5abdfd" },
];

export const draftOf = (key: DraftKey): Draft => DRAFTS.find((d) => d.key === key)!;

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

// ---- the demo maker's fixed script ----------------------------------------------------------------

export type ActionKey = "question" | "sham" | "update" | DraftKey;

export type DemoAction = {
  key: ActionKey;
  kind: "say" | "deliver";
  /** the button */
  label: string;
  /** what the maker writes: the message, or the delivery's note */
  text: string;
  /** the draft a delivery points at */
  draft?: DraftKey;
  /** what the network should reach when the maker holds the move */
  expect: PressVerdict | DeliveryVerdict;
  /** why, in one line */
  why: string;
};

export const DEMO_ACTIONS: DemoAction[] = [
  {
    key: "question",
    kind: "say",
    label: "Ask which glaze to name",
    text: "Which glaze should the description name? We make this mug in sea-green, oatmeal and charcoal, and the brief does not say which one this listing is for, so I need you to choose before I write it.",
    expect: "pass",
    why: "a real question the brief leaves open: the maker cannot go on without your answer",
  },
  {
    key: "sham",
    kind: "say",
    label: "Ask whether to write in English",
    text: "Should the description be written in English?",
    expect: "keep",
    why: "the brief already says plain English: a sham question does not stop the maker's clock",
  },
  {
    key: "update",
    kind: "say",
    label: "Send a progress update",
    text: "Working on it, nearly there.",
    expect: "keep",
    why: "a promise is not material: the move stays with the maker",
  },
  { key: "placeholder", kind: "deliver", draft: "placeholder", label: "Deliver a placeholder page", text: "First draft.", expect: "missing", why: "the page only says a draft is coming" },
  { key: "outline", kind: "deliver", draft: "outline", label: "Deliver an outline", text: "Here is the outline.", expect: "missing", why: "bullet points are not the finished description" },
  { key: "wrong", kind: "deliver", draft: "wrong", label: "Deliver the wrong piece (a teapot)", text: "Here is the description.", expect: "missing", why: "finished, but about a teapot, not the mug" },
  { key: "final", kind: "deliver", draft: "final", label: "Deliver the finished description", text: "The finished description.", expect: "delivered", why: "the whole mug description, ready for your review" },
  {
    key: "revised",
    kind: "deliver",
    draft: "revised",
    label: "Deliver the revised description",
    text: "Revised with a line about gift wrapping.",
    expect: "delivered",
    why: "the finished description with the gift-wrapping line added",
  },
];

export const ACTION_KEYS: ActionKey[] = DEMO_ACTIONS.map((a) => a.key);
export const actionOf = (key: string): DemoAction | null => DEMO_ACTIONS.find((a) => a.key === key) ?? null;

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

/**
 * Why the demo maker will not act on this commission now, in words a visitor can act on; "" when it
 * will. The server asks this of a fresh read before it signs, and so does the mock.
 */
export function demoActProblem(c: { id: string; studio: string; status: string } | null, demoStudio: string, action: "accept" | DemoAction | null, drafts: boolean): string {
  if (!demoStudio) return "the demo studio is not open on this contract yet";
  if (!action) return "the demo maker does only what its buttons say";
  if (!c) return "there is no such commission";
  if (c.studio !== demoStudio) return `${c.id} is not a commission of the demo studio; only its own maker acts on it`;
  if (action === "accept") {
    if (c.status !== "requested") return `${c.id} is ${c.status}; the demo maker accepts only a request`;
    return "";
  }
  if (c.status !== "active") return `${c.id} is ${c.status}; the demo maker acts only on an active commission`;
  if (action.kind === "deliver" && !drafts) return "the demo drafts are not pinned to a commit of the public repository yet, so the demo maker can talk but not deliver";
  return "";
}

// ---- the scripted reader of mock mode -------------------------------------------------------------

/** The client's messages the demo build knows, with what the network should make of them while the client holds the move. */
export const CLIENT_LINES: { text: string; expect: PressVerdict }[] = [
  { text: "Sea-green, please.", expect: "pass" },
  { text: "Oatmeal, please. It is the autumn colour.", expect: "pass" },
  { text: "I'll get back to you on that.", expect: "keep" },
  { text: "Please add one line saying it can be gift wrapped at checkout.", expect: "pass" },
  { text: "Looks lovely, thank you.", expect: "keep" },
  { text: "Can you make it pop a bit more?", expect: "unclear" },
];

export const FETCH_FAILED = "[TRANSIENT] the page could not be fetched; nothing was stored, and the delivery may be made again";

/**
 * What the in-memory contract of mock mode agrees on for a press, in place of the validators: the demo
 * maker's three messages and the client's suggested lines are read as the demo expects; any other
 * message lands unclear here, where on chain every validator asks its own model.
 */
export function scriptedPress(text: string): PressVerdict {
  const maker = DEMO_ACTIONS.find((a) => a.kind === "say" && a.text === text);
  if (maker) return maker.expect as PressVerdict;
  return CLIENT_LINES.find((l) => l.text === text)?.expect ?? "unclear";
}

/** What the mock agrees on for a delivered page: a demo draft as the demo expects; any other address cannot be fetched and stores nothing. */
export function scriptedDelivery(url: string): { verdict: DeliveryVerdict; fp: string } | { error: string } {
  const d = draftOfUrl(url);
  if (!d) return { error: FETCH_FAILED };
  return { verdict: d.expect, fp: d.fp };
}
