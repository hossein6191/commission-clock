"use client";

// "What the maker does next": the fixed script of the commission's demo job as buttons, each with the
// outcome the network should reach from where the move is now, so a visitor playing the client can see
// every verdict on purpose. A press of a button asks the site's server; the demo maker signs with its
// own key, and nothing the visitor typed ever goes with it. On a commission whose brief is not one of
// the demo briefs, word for word, it says why there are no buttons instead.

import { Brass } from "@/components/button";
import { DEMO_JOBS, expectedHolder, expectedVerdict, type DemoAction, type DemoJob } from "@/lib/demo-studio";
import { stampOf } from "@/lib/receipt";
import type { Holder } from "@/lib/rules";
import { cx } from "@/lib/cx";

export function DemoMoves({
  job,
  holder,
  busy,
  drafts,
  draftsReason,
  onAct,
}: {
  job: DemoJob;
  holder: Holder;
  busy: boolean;
  drafts: boolean;
  draftsReason: string;
  onAct: (a: DemoAction) => void;
}) {
  const groups: { title: string; kind: "say" | "deliver" }[] = [
    { title: "It writes", kind: "say" },
    { title: "It delivers a page", kind: "deliver" },
  ];
  return (
    <section aria-labelledby="demo-moves" className="sheet p-4 sm:p-5">
      <p className="kicker text-ink-3">The demo maker</p>
      <h2 id="demo-moves" className="mt-0.5 text-[24px]">
        What the maker does next
      </h2>
      <p className="mt-1 max-w-[62ch] text-[14px] text-ink-2">
        The demo job: <strong className="font-semibold text-ink">{job.title}</strong>. You play the client. Press one of these and the demo maker makes that move on chain,
        from its own key; next to each is what the network should agree, given that the move is now {holder ? `the ${holder}'s` : "nobody's"}.
      </p>
      {groups.map((g) => (
        <div key={g.kind} className="mt-4">
          <p className="text-[12px] font-bold tracking-[0.1em] text-ink-3 uppercase">{g.title}</p>
          {g.kind === "deliver" && !drafts && <p className="mt-1 text-[13px] text-amber-ink">Not available yet: {draftsReason}.</p>}
          <ul className="mt-1.5 flex flex-col gap-2">
            {job.actions.filter((a) => a.kind === g.kind).map((a) => {
              const verdict = expectedVerdict(a, holder);
              const after = expectedHolder(a, holder);
              const stamp = stampOf({ kind: a.kind, verdict, role: "maker", fp: "" }, "visitor");
              const disabled = busy || (a.kind === "deliver" && !drafts);
              return (
                <li key={a.key} className="flex flex-col gap-1.5 rounded-lg border border-line bg-card/70 p-2.5">
                  <Brass size="sm" className="self-start" disabled={disabled} onClick={() => onAct(a)}>
                    {a.label}
                  </Brass>
                  <p className="text-[12.5px] leading-snug text-ink-3">{a.kind === "say" ? <>&ldquo;{a.text}&rdquo;</> : a.why}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
                    <span className={cx("stamp !rotate-0 text-[11px]", verdict === "pass" || verdict === "delivered" ? "text-felt" : verdict === "missing" ? "text-flag-ink" : verdict === "noted" ? "text-ink-3" : "text-walnut")}>
                      {stamp.text.replace(/ \(fp [^)]*\)/, "")}
                    </span>
                    <span>{after === holder ? `the move stays with the ${holder || "nobody"}` : `the move goes to the ${after}`}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Why the demo maker makes no move on a commission of its studio: the brief is not one of its demo jobs, word for word. */
export function OffScriptNote({ status }: { status: string }) {
  return (
    <section aria-labelledby="off-script" className="sheet p-4 sm:p-5">
      <p className="kicker text-ink-3">The demo maker</p>
      <h2 id="off-script" className="mt-0.5 text-[22px]">
        No demo moves for this brief
      </h2>
      <p className="mt-1 max-w-[62ch] text-[14px] text-ink-2">
        The demo maker plays {DEMO_JOBS.length} jobs, and picks one by the brief, word for word. This brief is not one of them, so it has no script and no drafts here
        {status === "requested"
          ? " and will not accept it. Withdraw for the whole fee back, then commission the demo studio again with one of its brief chips."
          : ". Its clock still runs against the maker, and the waiting panel above says when you may cancel."}
      </p>
      <ul className="mt-2 list-disc pl-5 text-[13.5px] text-ink-3">
        {DEMO_JOBS.map((j) => (
          <li key={j.key}>{j.title}</li>
        ))}
      </ul>
    </section>
  );
}
