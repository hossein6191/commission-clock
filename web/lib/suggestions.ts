// One-click suggestions for every field a visitor types into, so nothing on the site needs typing.
// Every value here is inside the contract's limits; tests/unit/suggestions.test.mjs checks each one
// against lib/rules.ts. Each message chip carries what the network should make of it, so a visitor
// can try every verdict on purpose. All names are fictional.

import { CLIENT_LINES, DEMO_BRIEF, DEMO_TERMS } from "./demo-studio.ts";
import type { PressVerdict, Side } from "./rules.ts";

const GEN = 10n ** 18n;

export type Chip<T> = { label: string; value: T };

/** Studio names a maker can pick (none of them is the demo studio's name). */
export const NAME_CHIPS: string[] = ["Larkspur Lettering", "Saltmarsh Copy Room", "Tinbox Illustration", "Millbrook Menu Writers", "Copperleaf Label Studio", "Northfield Sign Painters"];

/** About lines, one per kind of work. */
export const ABOUT_CHIPS: string[] = [
  "Product descriptions for small shops, written to the word count.",
  "Menus and chalkboard copy for cafes, in plain English.",
  "Spot illustrations for newsletters, delivered as a web page.",
  "Wedding stationery wording, from invitations to thank-you cards.",
];

/** Whole sets of terms, from a quick demo clock to a working week. */
export type TermsChip = { label: string; note: string; feeAtto: bigint; makerSeconds: number; clientSeconds: number; stepSeconds: number; cutBps: number; maxCutBps: number };

export const TERMS_CHIPS: TermsChip[] = [
  { label: "Demo clock", note: "the demo studio's own: 20 min and 10 min, 10% per 2 min late", ...DEMO_TERMS },
  { label: "An afternoon", note: "1 GEN; 3 h for you, 1 h for the client, 5% per 15 min late, at most 40%", feeAtto: GEN, makerSeconds: 3 * 3600, clientSeconds: 3600, stepSeconds: 900, cutBps: 500, maxCutBps: 4000 },
  { label: "Two days", note: "2 GEN; 2 days for you, 1 day for the client, 5% per hour late, at most 40%", feeAtto: 2n * GEN, makerSeconds: 2 * 86400, clientSeconds: 86400, stepSeconds: 3600, cutBps: 500, maxCutBps: 4000 },
  { label: "A working week", note: "5 GEN; 5 days for you, 2 days for the client, 10% per started day late, at most 50%", feeAtto: 5n * GEN, makerSeconds: 5 * 86400, clientSeconds: 2 * 86400, stepSeconds: 86400, cutBps: 1000, maxCutBps: 5000 },
];

export const FEE_CHIPS: Chip<bigint>[] = [
  { label: "0.5 GEN", value: GEN / 2n },
  { label: "1 GEN", value: GEN },
  { label: "2 GEN", value: 2n * GEN },
  { label: "5 GEN", value: 5n * GEN },
];

export const MAKER_SECONDS_CHIPS: Chip<number>[] = [
  { label: "20 min", value: 1200 },
  { label: "3 h", value: 3 * 3600 },
  { label: "2 days", value: 2 * 86400 },
  { label: "5 days", value: 5 * 86400 },
];

export const CLIENT_SECONDS_CHIPS: Chip<number>[] = [
  { label: "10 min", value: 600 },
  { label: "1 h", value: 3600 },
  { label: "1 day", value: 86400 },
  { label: "2 days", value: 2 * 86400 },
];

export const STEP_CHIPS: Chip<number>[] = [
  { label: "2 min", value: 120 },
  { label: "15 min", value: 900 },
  { label: "1 h", value: 3600 },
  { label: "1 day", value: 86400 },
];

export const CUT_CHIPS: Chip<number>[] = [
  { label: "2%", value: 200 },
  { label: "5%", value: 500 },
  { label: "10%", value: 1000 },
];

export const CAP_CHIPS: Chip<number>[] = [
  { label: "20%", value: 2000 },
  { label: "40%", value: 4000 },
  { label: "50%", value: 5000 },
];

/** Briefs a client can send with one click. The first is the one the demo maker's drafts answer. */
export const BRIEF_CHIPS: Chip<string>[] = [
  { label: "The stoneware mug (the demo drafts)", value: DEMO_BRIEF },
  {
    label: "A bakery's welcome email",
    value: "A 100-word welcome email for new subscribers to a small bakery's newsletter. Friendly, plain English. Mention the Saturday sourdough and how to unsubscribe.",
  },
  {
    label: "A cafe's chalkboard menu",
    value: "Chalkboard copy for a cafe's autumn menu: six drinks and four cakes, one short line each, no prices. Cheerful but not twee.",
  },
];

/** A message chip: the text, and what the network should make of it from the side that holds the move. */
export type MessageChip = { label: string; text: string; expect: PressVerdict | "noted"; note: string };

const line = (text: string): PressVerdict => CLIENT_LINES.find((l) => l.text === text)!.expect;

/** What a client can say while it holds the move after a question from the maker. */
export const CLIENT_ANSWER_CHIPS: MessageChip[] = [
  { label: "Sea-green", text: "Sea-green, please.", expect: line("Sea-green, please."), note: "a concrete answer: the move goes back to the maker" },
  { label: "Oatmeal", text: "Oatmeal, please. It is the autumn colour.", expect: line("Oatmeal, please. It is the autumn colour."), note: "a concrete answer: the move goes back to the maker" },
  { label: "Later", text: "I'll get back to you on that.", expect: line("I'll get back to you on that."), note: "a promise keeps the move, and the clock, with you" },
];

/** What a client can say while it holds the move after a delivery. */
export const CLIENT_REVIEW_CHIPS: MessageChip[] = [
  {
    label: "Ask for a gift-wrapping line",
    text: "Please add one line saying it can be gift wrapped at checkout.",
    expect: line("Please add one line saying it can be gift wrapped at checkout."),
    note: "a specific revision: the move goes back to the maker",
  },
  { label: "Praise it", text: "Looks lovely, thank you.", expect: line("Looks lovely, thank you."), note: "praise keeps the move with you: accept the work instead" },
  { label: "A vague request", text: "Can you make it pop a bit more?", expect: line("Can you make it pop a bit more?"), note: "not concrete: the network may split, and unclear keeps the move with you" },
];

/** What a client can say while the maker holds the move: noted, and the maker's clock keeps running. */
export const CLIENT_NOTE_CHIPS: MessageChip[] = [
  { label: "Thank the maker", text: "Thank you for taking this on. The mug goes in our autumn listing.", expect: "noted", note: "noted: you do not hold the move, so nobody is asked" },
  { label: "Ask for news", text: "Any news on the draft?", expect: "noted", note: "noted: the maker's clock keeps running" },
];

/** What a maker of the visitor's own studio can say while it holds the move. */
export const MAKER_PRESS_CHIPS: MessageChip[] = [
  {
    label: "Ask which glaze",
    text: "Which glaze should the description name? We make this mug in sea-green, oatmeal and charcoal, and the brief does not say which one this listing is for, so I need you to choose before I write it.",
    expect: "pass",
    note: "a real question the brief leaves open",
  },
  { label: "Ask about English", text: "Should the description be written in English?", expect: "keep", note: "the brief already answers it" },
  { label: "Progress update", text: "Working on it, nearly there.", expect: "keep", note: "a promise is not material" },
];

/** Delivery notes. */
export const NOTE_CHIPS: string[] = ["The finished description.", "Here is the outline.", "Revised with a line about gift wrapping.", ""];

/** The message chips that fit who is writing and the state of the move. */
export function messageChipsFor(role: Side, holder: string, deliveries: number): MessageChip[] {
  if (role === "client") {
    if (holder !== "client") return CLIENT_NOTE_CHIPS;
    return deliveries > 0 ? [...CLIENT_REVIEW_CHIPS, ...CLIENT_ANSWER_CHIPS] : [...CLIENT_ANSWER_CHIPS, ...CLIENT_REVIEW_CHIPS];
  }
  if (holder !== "maker") return [{ label: "Check in", text: "Any thoughts on the draft?", expect: "noted", note: "noted: the client holds the move" }];
  return MAKER_PRESS_CHIPS;
}
