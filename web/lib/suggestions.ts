// One-click suggestions for every field a visitor types into, so nothing on the site needs typing.
// Every value here is inside the contract's limits; tests/unit/suggestions.test.mjs checks each one
// against lib/rules.ts. Each message chip carries what the network should make of it, so a visitor
// can try every verdict on purpose; on a commission the chips are its demo job's (the mug's for any
// other brief). All names are fictional.

import { DEMO_JOBS, DEMO_TERMS, LATER, jobOf, jobOfBrief, type DemoJob, type JobKey } from "./demo-studio.ts";
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

/** Briefs a client can send with one click: the four demo jobs, the mug first, each one the demo maker plays word for word. */
export const BRIEF_CHIPS: Chip<string>[] = DEMO_JOBS.map((j) => ({ label: `${j.title} (demo drafts)`, value: j.brief }));

/** A message chip: the text, and what the network should make of it from the side that holds the move. */
export type MessageChip = { label: string; text: string; expect: PressVerdict | "noted"; note: string };

/** One job's chips, by where the move is and who writes. */
export type JobChips = {
  /** the client, holding the move after a question: concrete answers, then "I'll get back to you" */
  answers: MessageChip[];
  /** the client, holding the move after a delivery: a specific revision, praise, a vague request */
  reviews: MessageChip[];
  /** the client while the maker holds the move: noted */
  notes: MessageChip[];
  /** a maker of the visitor's own studio, holding the move: a real question, a sham one, a promise */
  maker: MessageChip[];
  /** delivery notes */
  deliveryNotes: string[];
};

/** The verdict the demo build gives one of the job's own client lines. */
function line(job: DemoJob, text: string): PressVerdict {
  const l = job.lines.find((x) => x.text === text);
  if (!l) throw new Error(`no client line "${text}" in the ${job.key} job`);
  return l.expect;
}

const ANSWER = "a concrete answer: the move goes back to the maker";
const REVISION = "a specific revision: the move goes back to the maker";
const PRAISE = "praise keeps the move with you: accept the work instead";
const VAGUE = "not concrete: the network may split, and unclear keeps the move with you";
const NEWS: MessageChip = { label: "Ask for news", text: "Any news on the draft?", expect: "noted", note: "noted: the maker's clock keeps running" };
const THANKS_NOTE = "noted: you do not hold the move, so nobody is asked";

function chips(key: JobKey, c: { answers: [string, string][]; revision: [string, string]; praise: string; vague: string; thanks: string }): JobChips {
  const job = jobOf(key);
  const say = job.actions.filter((a) => a.kind === "say");
  const notes = job.actions.filter((a) => a.kind === "deliver");
  const note = (k: string) => notes.find((a) => a.key === k)!.text;
  return {
    answers: [
      ...c.answers.map(([label, text]) => ({ label, text, expect: line(job, text), note: ANSWER })),
      { label: "Later", text: LATER, expect: line(job, LATER), note: "a promise keeps the move, and the clock, with you" },
    ],
    reviews: [
      { label: c.revision[0], text: c.revision[1], expect: line(job, c.revision[1]), note: REVISION },
      { label: "Praise it", text: c.praise, expect: line(job, c.praise), note: PRAISE },
      { label: "A vague request", text: c.vague, expect: line(job, c.vague), note: VAGUE },
    ],
    notes: [{ label: "Thank the maker", text: c.thanks, expect: "noted", note: THANKS_NOTE }, NEWS],
    maker: [
      { label: say[0].label, text: say[0].text, expect: say[0].expect as PressVerdict, note: "a real question the brief leaves open" },
      { label: say[1].label, text: say[1].text, expect: say[1].expect as PressVerdict, note: "the brief already answers it" },
      { label: "Progress update", text: say[2].text, expect: say[2].expect as PressVerdict, note: "a promise is not material" },
    ],
    deliveryNotes: [note("final"), note("outline"), note("revised"), ""],
  };
}

/** Every demo job's chips. */
export const JOB_CHIPS: Record<JobKey, JobChips> = {
  mug: chips("mug", {
    answers: [
      ["Sea-green", "Sea-green, please."],
      ["Oatmeal", "Oatmeal, please. It is the autumn colour."],
    ],
    revision: ["Ask for a gift-wrapping line", "Please add one line saying it can be gift wrapped at checkout."],
    praise: "Looks lovely, thank you.",
    vague: "Can you make it pop a bit more?",
    thanks: "Thank you for taking this on. The mug goes in our autumn listing.",
  }),
  bakery: chips("bakery", {
    answers: [["8 am", "At 8 am, and it stays on the shelves until it sells out."]],
    revision: ["Ask for a free-coffee line", "Please add one line saying new subscribers get a free coffee with their first loaf."],
    praise: "That reads beautifully, thank you.",
    vague: "Could it feel a bit more special?",
    thanks: "Thank you for taking this on. The email goes to our new subscribers next week.",
  }),
  cafe: chips("cafe", {
    answers: [["The prices", "Espresso 2.50, flat white 3.20, hot chocolate 3.40, chai latte 3.40, mint tea 2.80, lemon drizzle 3.00, carrot cake 3.50, brownie 2.90."]],
    revision: ["Ask for an oat milk line", "Please add a last line saying oat milk is free in any drink."],
    praise: "Perfect, that will look great on the board.",
    vague: "Can it be a bit more fun?",
    thanks: "Thank you for taking this on. The board goes up on Monday.",
  }),
  bike: chips("bike", {
    answers: [["Fifteen years", "Fifteen years. We opened in the spring of 2011."]],
    revision: ["Ask for a wheelchairs line", "Please add that we fix wheelchairs and prams too."],
    praise: "Spot on, thank you.",
    vague: "Could it have a bit more personality?",
    thanks: "Thank you for taking this on. The new website goes live next month.",
  }),
};

/** The chips for a commission's brief: its demo job's, or the mug's for any other brief. */
export const chipsFor = (brief: string): JobChips => JOB_CHIPS[(jobOfBrief(brief) ?? DEMO_JOBS[0]).key];

/** What a maker writes while the client holds the move: noted. */
export const MAKER_NOTE_CHIP: MessageChip = { label: "Check in", text: "Any thoughts on the draft?", expect: "noted", note: "noted: the client holds the move" };

/** The message chips that fit who is writing, the state of the move and the commission's brief. */
export function messageChipsFor(role: Side, holder: string, deliveries: number, brief = ""): MessageChip[] {
  const c = chipsFor(brief);
  if (role === "client") {
    if (holder !== "client") return c.notes;
    return deliveries > 0 ? [...c.reviews, ...c.answers] : [...c.answers, ...c.reviews];
  }
  if (holder !== "maker") return [MAKER_NOTE_CHIP];
  return c.maker;
}
