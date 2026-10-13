"use client";

// How it works, in the contract's own words: the four askings of a press and of a delivery word for
// word, how the answers combine, why this needs validators that agree and a live web they read, the
// money table on the demo studio's terms, the limits, and rules() read live from the contract.

import * as React from "react";

import { Section } from "@/components/bits";
import { BrassLink } from "@/components/button";
import { Placeholder, ReadError } from "@/components/read-state";
import { useRead } from "@/components/use-read";
import { readRules } from "@/lib/chain";
import { acceptSplit, cancelSplit, silenceSplit, type ClockState } from "@/lib/clock";
import { DEMO_TERMS } from "@/lib/demo-studio";
import { durationLabel, gen, pct } from "@/lib/format";
import {
  ACCEPT_WINDOW,
  KILL_BPS,
  MAX_BRIEF,
  MAX_PAGE_TEXT,
  MAX_RAW_PAGE,
  MAX_TEXT,
  MAX_TO_CAP,
  PRESS_RULES,
  QUESTION_CARRY,
  QUESTION_HAND,
  QUESTION_MISSING,
  QUESTION_THERE,
  READING,
  THREAD_WINDOW,
  TURN_GRACE,
  TURN_NOTICE,
} from "@/lib/rules";

function Asking({ n, blocks, q }: { n: number; blocks: string; q: string }) {
  return (
    <li className="sheet p-3.5">
      <p className="text-[12px] font-bold tracking-[0.1em] text-ink-3 uppercase">
        Asking {n} · blocks {blocks}
      </p>
      <p className="mono mt-1.5 text-[14px] leading-relaxed break-words text-ink">{q}</p>
    </li>
  );
}

/** The demo terms at one moment of a commission, for the money table. */
const at = (makerUsed: number, clientUsed: number, holder: "maker" | "client"): ClockState => ({
  holder,
  since: 0,
  handedBy: 0,
  makerUsed,
  clientUsed,
  makerSeconds: DEMO_TERMS.makerSeconds,
  clientSeconds: DEMO_TERMS.clientSeconds,
  stepSeconds: DEMO_TERMS.stepSeconds,
  cutBps: DEMO_TERMS.cutBps,
  maxCutBps: DEMO_TERMS.maxCutBps,
});

export default function HowPage() {
  const rules = useRead(() => readRules(), []);
  const fee = DEMO_TERMS.feeAtto;
  const rows: { when: string; who: string; maker: bigint; client: bigint }[] = [
    { when: "The client accepts; the maker used 14 of its 20 minutes", who: "accept_work", ...pair(acceptSplit(at(840, 200, "client"), fee, 0)) },
    { when: "The client accepts; the maker used 25 minutes, 5 over (3 started steps)", who: "accept_work", ...pair(acceptSplit(at(1500, 200, "client"), fee, 0)) },
    { when: "The client sits on a delivered draft past its 10 minutes", who: "claim_silence", ...pair(silenceSplit(at(900, 700, "client"), fee, 1, 0)) },
    { when: "The client sits on a question past its 10 minutes, nothing delivered", who: "claim_silence", ...pair(silenceSplit(at(600, 700, "client"), fee, 0, 0)) },
    { when: "The maker stalls until its cut reaches the 50% cap, nothing delivered", who: "cancel_late", ...pair(cancelSplit(at(1700, 0, "maker"), fee, 0, 0)) },
    { when: "The maker stalls past the cap after a delivery", who: "cancel_late", ...pair(cancelSplit(at(1700, 0, "maker"), fee, 1, 0)) },
    { when: "The client withdraws, or the maker declines, before acceptance", who: "withdraw_request / decline", maker: 0n, client: fee },
  ];
  return (
    <div className="flex flex-col gap-12">
      <div className="max-w-[72ch]">
        <p className="kicker text-ink-3">How it works</p>
        <h1 className="mt-1.5 text-[38px] sm:text-[52px]">A clock that only runs on the side that owes the move</h1>
        <p className="mt-3 text-[17px] text-ink-2">
          A commission deadline counts wall time, so a maker is charged for the days a client sat on a question, and a maker can stop any pausing clock with a sham question.
          Here the move changes hands only when the network agrees a message really hands it over, and a delivery counts only when every validator opens the page and agrees
          the finished piece is there. The money follows those agreed turns.
        </p>
      </div>

      <section aria-labelledby="press">
        <Section
          n={1}
          id="press"
          title="A press: four askings, one block"
          sub={`A message from the side that holds the move. Every validator asks its model these four itself, over the brief, the last ${THREAD_WINDOW} messages (and the one that handed the holder the move, when it is older) and the new message, all fenced and marked untrusted. {holder} and {other} are the words maker and client, put in by the contract.`}
        />
        <ol className="grid gap-2.5 md:grid-cols-2">
          <Asking n={1} blocks="BRIEF, THREAD, MESSAGE" q={QUESTION_HAND} />
          <Asking n={2} blocks="BRIEF, MESSAGE, THREAD" q={QUESTION_HAND} />
          <Asking n={3} blocks="BRIEF, THREAD, MESSAGE" q={QUESTION_CARRY} />
          <Asking n={4} blocks="BRIEF, MESSAGE, THREAD" q={QUESTION_CARRY} />
        </ol>
        <p className="mono mt-3 rounded-lg border border-line bg-card p-3 text-[13.5px] leading-relaxed text-ink-2">{PRESS_RULES}</p>
        <div className="mt-3 grid gap-2 text-[14.5px] sm:grid-cols-3">
          <p className="sheet p-3">
            <span className="stamp !rotate-0 text-felt">pass</span>
            <br />
            HAND yes in both orders and CARRY no in both: the move goes over, its first {TURN_GRACE / 60} minutes not charged.
          </p>
          <p className="sheet p-3">
            <span className="stamp !rotate-0 text-walnut">keep</span>
            <br />
            HAND no in both orders and CARRY yes in both: the move, and the clock, stay.
          </p>
          <p className="sheet p-3">
            <span className="stamp !rotate-0 text-amber-ink">unclear</span>
            <br />
            Anything else: the move stays; the holder may rephrase. Disagreement is a value, never a tolerance.
          </p>
        </div>
      </section>

      <section aria-labelledby="delivery">
        <Section
          n={2}
          id="delivery"
          title="A delivery: the page, read on the live web"
          sub={`Every validator fetches the page itself (an error status stores nothing), collapses the spacing of at most ${MAX_RAW_PAGE.toLocaleString("en")} characters, keeps ${MAX_PAGE_TEXT.toLocaleString("en")}, fingerprints them, and asks:`}
        />
        <ol className="grid gap-2.5 md:grid-cols-2">
          <Asking n={1} blocks="BRIEF then PAGE" q={QUESTION_THERE} />
          <Asking n={2} blocks="PAGE then BRIEF" q={QUESTION_THERE} />
          <Asking n={3} blocks="BRIEF then PAGE" q={QUESTION_MISSING} />
          <Asking n={4} blocks="PAGE then BRIEF" q={QUESTION_MISSING} />
        </ol>
        <p className="mono mt-3 rounded-lg border border-line bg-card p-3 text-[13.5px] leading-relaxed text-ink-2">{READING}</p>
        <p className="mt-3 max-w-[72ch] text-[14.5px] text-ink-2">
          The stored value is the verdict and the page&apos;s 16-character fingerprint, compared by exact equality: a page that does not read the same for every validator gets no
          consensus and stores nothing. Delivered hands the move to the client for review; missing and unclear change only the thread and the record.
        </p>
      </section>

      <section aria-labelledby="why">
        <Section n={3} id="why" title="Why this needs GenLayer" />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="sheet p-4">
            <h3 className="text-[19px]">Somebody has to judge the turn</h3>
            <p className="mt-1.5 text-[14.5px] text-ink-2">
              &ldquo;Should this be in English?&rdquo; looks like a question and is not one when the brief already says English. Only reading the brief and the thread tells the two
              apart; a fixed rule cannot.
            </p>
          </div>
          <div className="sheet p-4">
            <h3 className="text-[19px]">Whoever judges must not be paid by one side</h3>
            <p className="mt-1.5 text-[14.5px] text-ink-2">
              A platform that judges the turns is paid by somebody. Here independent validators each judge it themselves, and only a value they agree on exactly is stored.
            </p>
          </div>
          <div className="sheet p-4">
            <h3 className="text-[19px]">The work lives on the web</h3>
            <p className="mt-1.5 text-[14.5px] text-ink-2">
              A delivery is a page. Every validator opens it on the live web and reads it before the move, and the money, follow; an ordinary contract cannot see a page at all.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="money">
        <Section
          n={4}
          id="money"
          title="Where the fee goes"
          sub={`On the demo studio's terms: ${gen(fee)}, ${durationLabel(DEMO_TERMS.makerSeconds)} for the maker, ${durationLabel(DEMO_TERMS.clientSeconds)} for the client, ${pct(DEMO_TERMS.cutBps)} of the fee per started ${durationLabel(DEMO_TERMS.stepSeconds)} late, at most ${pct(DEMO_TERMS.maxCutBps)}. The kill fee is ${pct(KILL_BPS)}, never more than the fee less the late cut.`}
        />
        <div className="sheet overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-line-strong text-[12px] tracking-[0.06em] text-ink-3 uppercase">
                <th className="px-3 py-2 font-bold">When</th>
                <th className="px-3 py-2 font-bold">Call</th>
                <th className="px-3 py-2 text-right font-bold">Maker</th>
                <th className="px-3 py-2 text-right font-bold">Client</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.when} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink-2">{r.when}</td>
                  <td className="mono px-3 py-2 text-[13px]">{r.who}</td>
                  <td className="mono px-3 py-2 text-right">{gen(r.maker)}</td>
                  <td className="mono px-3 py-2 text-right">{gen(r.client)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-[72ch] text-[14.5px] text-ink-2">
          Nobody settles against a side before its current turn has been charged {TURN_NOTICE / 60} minutes, so a side handed the move always has time to answer. A request can be
          accepted for {durationLabel(ACCEPT_WINDOW)}; after that it can only be withdrawn or declined. A studio&apos;s cut must reach its cap within {durationLabel(MAX_TO_CAP)} of
          the maker&apos;s allowance running out, so a client whose maker goes silent can always cancel.
        </p>
      </section>

      <section aria-labelledby="limits">
        <Section n={5} id="limits" title="The limits, stated plainly" />
        <ul className="grid list-disc gap-1.5 pl-5 text-[14.5px] text-ink-2 md:grid-cols-2">
          <li>Text is read, images are not: a delivery must hold the finished piece as text.</li>
          <li>A page must read the same for every validator at the moment of the delivery; a page that changes per visitor stores nothing.</li>
          <li>Whoever controls the page address controls what is read: the demo drafts are pinned to one commit for that reason.</li>
          <li>The model can be wrong; asking four times in two orders and two framings turns any doubt into unclear, which moves nothing.</li>
          <li>
            Briefs are at most {MAX_BRIEF} characters, messages {MAX_TEXT}, all printable ASCII on one line, so a message can never fake a line of the thread.
          </li>
          <li>Time is the transaction&apos;s own datetime: a turn starts at the time of the transaction that began it.</li>
        </ul>
      </section>

      <section aria-labelledby="rules">
        <Section n={6} id="rules" title="rules(), read live" sub="The contract's own words for its askings, its clock, who may do what and where the money goes." />
        {rules.error ? (
          <ReadError detail={rules.error} onRetry={rules.retry} />
        ) : !rules.data ? (
          <Placeholder lines={6} />
        ) : (
          <details className="sheet p-4">
            <summary className="cursor-pointer font-semibold">Show the whole answer</summary>
            <pre className="mono mt-3 max-h-[520px] overflow-auto rounded-lg bg-walnut-deep p-3 text-[12.5px] leading-relaxed whitespace-pre-wrap text-amber-wash">
              {JSON.stringify(rules.data, null, 2)}
            </pre>
          </details>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <BrassLink href="/studio">Try it as the client</BrassLink>
        <BrassLink href="/maker" variant="plain">
          Open your own studio
        </BrassLink>
      </div>
    </div>
  );
}

function pair(s: { toMaker: bigint; toClient: bigint }): { maker: bigint; client: bigint } {
  return { maker: s.toMaker, client: s.toClient };
}
