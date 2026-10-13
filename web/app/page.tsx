"use client";

// The front of the table: the promise in one minute with the clock playing a whole commission, how
// the money moves, and where to start: as the client of the demo studio, or as a maker.

import { Section } from "@/components/bits";
import { BrassLink, PlungerLink } from "@/components/button";
import { MiniDemo } from "@/components/mini-demo";
import { acceptSplit, cancelSplit, silenceSplit, type ClockState } from "@/lib/clock";
import { DEMO_TERMS } from "@/lib/demo-studio";
import { durationLabel, gen, pct } from "@/lib/format";
import { TURN_GRACE } from "@/lib/rules";

const base = (makerUsed: number, clientUsed: number, holder: "maker" | "client"): ClockState => ({
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

export default function Home() {
  const fee = DEMO_TERMS.feeAtto;
  const onTime = acceptSplit(base(900, 120, "client"), fee, 0);
  const late = acceptSplit(base(1440, 120, "client"), fee, 0);
  const silent = silenceSplit(base(600, 700, "client"), fee, 0, 0);
  const cancelled = cancelSplit(base(1700, 60, "maker"), fee, 0, 0);
  return (
    <div className="flex flex-col gap-16">
      <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] lg:items-center">
        <div className="min-w-0">
          <p className="kicker text-walnut">A commission escrow with a chess clock</p>
          <h1 className="mt-3 text-[42px] sm:text-[62px]">The deadline only runs on the side that owes the move.</h1>
          <p className="mt-4 max-w-[58ch] text-[18px] text-ink-2">
            After every message the validators decide whose move it is now. The clock runs only against that side, and the late cut comes out of the fee by the seconds each
            side actually owed: never for the days a client sat on a question, never paused by a sham one.
          </p>
          <div className="mt-7 flex flex-wrap items-end gap-x-8 gap-y-5">
            <PlungerLink href="/studio" label="Press: commission the demo studio" glyph={<span className="mono text-[13px]">GO</span>} />
            <BrassLink href="/how" variant="plain">
              Read how it is judged
            </BrassLink>
          </div>
        </div>
        <MiniDemo />
      </section>

      <section aria-labelledby="promise">
        <Section n={1} id="promise" title="The promise, in one minute" />
        <ol className="grid gap-3 md:grid-cols-3">
          <li className="sheet p-4">
            <p className="mono text-[13px] text-ink-3">01</p>
            <h3 className="mt-1 text-[21px]">A press counts only if the network agrees</h3>
            <p className="mt-1.5 text-[14.5px] text-ink-2">
              A message from the side holding the move is a press. Every validator asks its model, in both orders and both framings, whether it really leaves that side
              waiting: a real question, real material, concrete revisions. Only then does the move go over.
            </p>
          </li>
          <li className="sheet p-4">
            <p className="mono text-[13px] text-ink-3">02</p>
            <h3 className="mt-1 text-[21px]">A delivery counts only if the page holds the work</h3>
            <p className="mt-1.5 text-[14.5px] text-ink-2">
              The maker points at a page. Every validator opens it on the live web and agrees the finished piece is there, not a placeholder, an outline or the wrong thing; then
              the client owes a review.
            </p>
          </li>
          <li className="sheet p-4">
            <p className="mono text-[13px] text-ink-3">03</p>
            <h3 className="mt-1 text-[21px]">The money follows the agreed turns</h3>
            <p className="mt-1.5 text-[14.5px] text-ink-2">
              The fee waits in the contract. The maker&apos;s cut grows with every started step it is over its own allowance, and a side handed the move gets{" "}
              {TURN_GRACE / 60} minutes&apos; grace while the round settles.
            </p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="money">
        <Section
          n={2}
          id="money"
          title="How the money moves"
          sub={`On the demo studio's terms: ${gen(fee)}; ${durationLabel(DEMO_TERMS.makerSeconds)} for the maker and ${durationLabel(DEMO_TERMS.clientSeconds)} for the client; ${pct(DEMO_TERMS.cutBps)} of the fee for every started ${durationLabel(DEMO_TERMS.stepSeconds)} the maker is over, at most ${pct(DEMO_TERMS.maxCutBps)}.`}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "On time", line: "The client accepts; the maker used 15 of its 20 minutes.", s: onTime },
            { title: "Late", line: "The client accepts; the maker went 4 minutes over: two started steps.", s: late },
            { title: "The client goes silent", line: "Before any delivery, past its 10 minutes: the maker takes a kill fee.", s: silent },
            { title: "The maker goes silent", line: "Its cut reaches the cap and the client cancels: all of it back.", s: cancelled },
          ].map((x) => (
            <div key={x.title} className="sheet flex flex-col p-4">
              <h3 className="text-[20px]">{x.title}</h3>
              <p className="mt-1 flex-1 text-[14px] text-ink-2">{x.line}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-dashed border-line-strong pt-2.5">
                <div>
                  <dt className="text-[11px] font-bold tracking-[0.1em] text-ink-3 uppercase">Maker</dt>
                  <dd className="mono text-[20px] text-ink">{gen(x.s.toMaker)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold tracking-[0.1em] text-ink-3 uppercase">Client</dt>
                  <dd className="mono text-[20px] text-ink">{gen(x.s.toClient)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
        <p className="mt-3 max-w-[72ch] text-[14.5px] text-ink-2">Until it settles, the fee is held by the contract: not by the maker, not by the site. Every settlement pays the whole of it out in one transaction.</p>
      </section>

      <section aria-labelledby="start">
        <Section n={3} id="start" title="Start" />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="sheet flex flex-col p-4">
            <h3 className="text-[21px]">Play the client</h3>
            <p className="mt-1.5 flex-1 text-[14.5px] text-ink-2">Commission the demo studio with one wallet. Its maker accepts and makes every kind of move when you press its buttons.</p>
            <BrassLink href="/studio" className="mt-3 self-start">
              The demo studio
            </BrassLink>
          </div>
          <div className="sheet flex flex-col p-4">
            <h3 className="text-[21px]">Be a maker</h3>
            <p className="mt-1.5 flex-1 text-[14.5px] text-ink-2">Open a studio with your own fee and your own clock, accept requests, and deliver your work as a page.</p>
            <BrassLink href="/maker" className="mt-3 self-start">
              The maker&apos;s desk
            </BrassLink>
          </div>
          <div className="sheet flex flex-col p-4">
            <h3 className="text-[21px]">Check the books</h3>
            <p className="mt-1.5 flex-1 text-[14.5px] text-ink-2">Every studio&apos;s record and the contract&apos;s totals, read live from the chain.</p>
            <BrassLink href="/ledger" variant="plain" className="mt-3 self-start">
              The ledger
            </BrassLink>
          </div>
        </div>
      </section>
    </div>
  );
}
