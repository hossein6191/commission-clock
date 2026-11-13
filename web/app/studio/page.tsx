"use client";

// The demo studio: Fernhill Pottery copy desk, its terms read live from the contract, its public
// record, the four demo jobs it plays, and the form that commissions it with the visitor's own wallet.
// The demo maker accepts a request with one of those briefs, word for word, when asked, and then makes
// the moves its buttons name in the commission's room.

import * as React from "react";

import { DemoNote, Section, TermsList } from "@/components/bits";
import { BrassLink } from "@/components/button";
import { StageTrack } from "@/components/stages";
import { ChessClock } from "@/components/chess-clock";
import { CommissionForm } from "@/components/commission-form";
import { Placeholder, ReadError } from "@/components/read-state";
import { RecordGrid } from "@/components/record-grid";
import { useDemoStatus } from "@/components/use-demo";
import { useAfterTx, useRead } from "@/components/use-read";
import { readStudio, studioPath } from "@/lib/chain";
import { DEMO_JOBS, DEMO_STAGES, DEMO_STUDIO_NAME, DEMO_TERMS, STAGED_ABOUT, STAGED_STUDIO_NAME, STAGED_TERMS } from "@/lib/demo-studio";
import { stageShares } from "@/lib/stages";
import { stagesOf } from "@/lib/rules";
import { durationLabel, gen, pct } from "@/lib/format";
import { APPEAL_WINDOW, TURN_GRACE, TURN_NOTICE } from "@/lib/rules";

/** The three-stage demo studio's stages, as the contract reads its ninth argument. */
const STAGED = stagesOf(DEMO_STAGES).stages;
const STAGED_SHARES = stageShares(STAGED_TERMS.feeAtto, STAGED.map((x) => x.bps));

/** The second demo studio: the mug job paid in three stages, so a visitor can walk every stage. */
function StagedDemo({ id }: { id: string }) {
  return (
    <section aria-labelledby="staged-demo" className="sheet p-4 sm:p-6">
      <p className="kicker text-ink-3">The second demo studio{id ? ` · ${id}` : ""}</p>
      <h2 id="staged-demo" className="mt-0.5 text-[28px]">
        {STAGED_STUDIO_NAME}
      </h2>
      <p className="mt-1 max-w-[66ch] text-[15px] text-ink-2">
        {STAGED_ABOUT} Commission it with the mug brief and walk all three: the demo maker delivers the outline, you accept stage 1 and {gen(STAGED_SHARES[0])} is paid at once;
        then the first draft, then the finished description. Each page is judged against the stage that is current, so the outline delivered at stage 2 reads as missing. A
        verdict that went against you can be appealed once within {APPEAL_WINDOW / 60} minutes, with a 0.1 GEN bond from your credit.
      </p>
      <StageTrack
        className="mt-3"
        title={`${gen(STAGED_TERMS.feeAtto)}, paid in three stages`}
        terms
        current={0}
        stages={STAGED.map((x, i) => ({ k: i + 1, name: x.name, about: x.about, shareBps: x.bps, shareAtto: STAGED_SHARES[i].toString(), status: "pending", releasedAtto: "0", cutAtto: "0", cutBps: 0, url: "", fp: "", deliveredBy: 0, closedAt: 0 }))}
      />
      {id ? (
        <BrassLink href={studioPath(id)} className="mt-4">
          Commission the staged studio
        </BrassLink>
      ) : (
        <p className="mt-3 text-[14px] text-ink-3">The staged demo studio is not open on this contract yet; the one-stage studio above works meanwhile.</p>
      )}
    </section>
  );
}

export default function DemoStudioPage() {
  const demo = useDemoStatus();
  const id = demo?.studio ?? "";
  const studio = useRead(() => readStudio(id), [id], { enabled: !!id });
  useAfterTx(() => void studio.refresh());
  const s = studio.data;

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-center">
        <div className="min-w-0">
          <p className="kicker text-ink-3">The demo studio{id ? ` · ${id}` : ""}</p>
          <h1 className="mt-1.5 text-[38px] sm:text-[54px]">{DEMO_STUDIO_NAME}</h1>
          <p className="mt-3 max-w-[60ch] text-[17px] text-ink-2">
            A potter&apos;s copy desk that writes its own product descriptions and takes small jobs from the shops on its street. Commission it with your wallet and one of its{" "}
            {DEMO_JOBS.length} demo briefs and you play the client: the demo maker accepts, asks, stalls and delivers when you press its buttons, and the validators decide
            after every move whose move it is now.
          </p>
          <ul className="mt-3 flex max-w-[60ch] flex-col gap-1 text-[14.5px] text-ink-2">
            {DEMO_JOBS.map((j) => (
              <li key={j.key}>
                <span className="font-semibold text-ink">{j.title}</span>: the brief leaves open {j.open}, so the maker&apos;s real question is real.
              </li>
            ))}
          </ul>
          <DemoNote className="mt-4" />
        </div>
        <ChessClock
          holder="maker"
          maker={{ left: DEMO_TERMS.makerSeconds, used: 0, allowance: DEMO_TERMS.makerSeconds }}
          client={{ left: DEMO_TERMS.clientSeconds, used: 0, allowance: DEMO_TERMS.clientSeconds }}
          plate={`${durationLabel(DEMO_TERMS.makerSeconds)} for the maker, ${durationLabel(DEMO_TERMS.clientSeconds)} for you`}
        />
      </div>

      {!demo ? (
        <Placeholder lines={5} />
      ) : !id ? (
        <div className="sheet p-5 text-ink-2">
          <p className="font-semibold text-ink">The demo studio is not open on this contract yet.</p>
          <p className="mt-1">Every other studio still works: pick one under Studios, or open your own at the maker&apos;s desk.</p>
        </div>
      ) : studio.error ? (
        <ReadError detail={studio.error} onRetry={studio.retry} />
      ) : !s ? (
        studio.loading ? (
          <Placeholder lines={6} />
        ) : (
          <div className="sheet p-5 text-ink-2">The contract holds no studio {id}.</div>
        )
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <section aria-labelledby="commission-it" className="sheet min-w-0 p-4 sm:p-6">
            <Section
              n={1}
              id="commission-it"
              title="Commission it"
              sub={
                <>
                  Pick one of the {DEMO_JOBS.length} demo briefs: the demo maker plays only those, word for word. The fee is held by the contract, not paid to the maker, until the
                  commission settles. Withdraw before the maker accepts and all of it comes back.
                </>
              }
            />
            <CommissionForm s={s} />
          </section>
          <div className="flex min-w-0 flex-col gap-6">
            <section aria-labelledby="terms" className="sheet p-4 sm:p-5">
              <h2 id="terms" className="text-[22px]">
                Its terms, read live
              </h2>
              <p className="mt-1 text-[13.5px] text-ink-3">Fixed for good when the studio was opened; every commission copies them.</p>
              <TermsList s={s} className="mt-3" />
              <p className="mt-3 text-[13.5px] text-ink-2">
                So: {gen(s.feeAtto)} if the maker finishes inside {durationLabel(s.makerSeconds)} of its own turns; {pct(s.cutBps)} of the fee back to you for every started{" "}
                {durationLabel(s.stepSeconds).replace(/^1 /, "")} past that, up to {pct(s.maxCutBps)}. A turn handed over by a judged message is not charged for its first{" "}
                {TURN_GRACE / 60} minutes, and nobody settles against a side before its current turn has run {TURN_NOTICE / 60} minutes.
              </p>
            </section>
            <section aria-labelledby="record" className="sheet p-4 sm:p-5">
              <h2 id="record" className="text-[22px]">
                Its record
              </h2>
              <RecordGrid r={s.record} className="mt-3" />
            </section>
          </div>
        </div>
      )}

      {demo && <StagedDemo id={demo.staged} />}
    </div>
  );
}
