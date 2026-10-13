"use client";

// The contract's totals, read live: every fee taken in, where it went, what is still held, and what
// the network made of every press and every page. The held total must equal the fees taken in less
// everything paid out; the page says so, and says it when it does not.

import { Section } from "@/components/bits";
import { Placeholder, ReadError } from "@/components/read-state";
import { useAfterTx, useRead } from "@/components/use-read";
import { readStats } from "@/lib/chain";
import { gen } from "@/lib/format";
import { cx } from "@/lib/cx";

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <dt className="text-[11.5px] font-bold tracking-[0.06em] text-ink-3 uppercase">{label}</dt>
      <dd className={cx("mono text-[22px] leading-tight", tone ?? "text-ink")}>{value}</dd>
    </div>
  );
}

export default function LedgerPage() {
  const stats = useRead(() => readStats(), []);
  useAfterTx(() => void stats.refresh());
  const s = stats.data;
  const balanced = s ? BigInt(s.heldAtto) === BigInt(s.takenAtto) - BigInt(s.toMakersAtto) - BigInt(s.toClientsAtto) : true;
  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="kicker text-ink-3">Ledger</p>
        <h1 className="mt-1.5 text-[38px] sm:text-[52px]">Every atto, accounted for</h1>
        <p className="mt-2 max-w-[62ch] text-[17px] text-ink-2">The contract&apos;s own totals, read live. It only ever holds the fees of commissions requested or active.</p>
      </div>
      {stats.error ? (
        <ReadError detail={stats.error} onRetry={stats.retry} />
      ) : !s ? (
        <Placeholder lines={8} />
      ) : (
        <>
          <section aria-labelledby="money">
            <Section n={1} id="money" title="The money" />
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4">
              <Cell label="Fees taken in" value={gen(s.takenAtto)} />
              <Cell label="Paid to makers" value={gen(s.toMakersAtto)} tone="text-felt-ink" />
              <Cell label="Back to clients" value={gen(s.toClientsAtto)} />
              <Cell label="Held right now" value={gen(s.heldAtto)} tone="text-amber-ink" />
            </dl>
            <p className={cx("mt-3 text-[14.5px]", balanced ? "text-felt-ink" : "font-semibold text-flag-ink")}>
              {balanced
                ? `Held = taken in − paid to makers − back to clients: ${gen(s.heldAtto)} = ${gen(s.takenAtto)} − ${gen(s.toMakersAtto)} − ${gen(s.toClientsAtto)}.`
                : "The held total does not equal the fees taken in less everything paid out."}{" "}
              {s.refusedPayments > 0 && `${s.refusedPayments} refused ${s.refusedPayments === 1 ? "request" : "requests"} sent ${gen(s.returnedAtto)} straight back in the same transaction.`}
            </p>
          </section>
          <section aria-labelledby="commissions">
            <Section n={2} id="commissions" title="How commissions ended" />
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-5">
              <Cell label="Studios" value={String(s.studios)} />
              <Cell label="Commissions" value={String(s.commissions)} />
              <Cell label="Waiting" value={String(s.waiting)} tone="text-amber-ink" />
              <Cell label="On the clock" value={String(s.active)} />
              <Cell label="Accepted" value={String(s.accepted)} tone="text-felt-ink" />
              <Cell label="By silence" value={String(s.acceptedBySilence)} tone="text-felt-ink" />
              <Cell label="Lapsed" value={String(s.lapsed)} />
              <Cell label="Cancelled late" value={String(s.cancelledLate)} tone="text-flag-ink" />
              <Cell label="Withdrawn" value={String(s.withdrawn)} />
              <Cell label="Declined" value={String(s.declined)} />
            </dl>
          </section>
          <section aria-labelledby="verdicts">
            <Section n={3} id="verdicts" title="What the network agreed" sub="A press is a message from the side that holds the move; a page is a delivery read on the live web." />
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-5">
              <Cell label="Presses" value={String(s.presses)} />
              <Cell label="Counted" value={String(s.passed)} tone="text-felt-ink" />
              <Cell label="Not counted" value={String(s.kept)} />
              <Cell label="Unclear" value={String(s.unclear)} tone="text-amber-ink" />
              <Cell label="Noted" value={String(s.noted)} />
              <Cell label="Moves taken" value={String(s.takes)} />
              <Cell label="Pages read" value={String(s.deliveries)} />
              <Cell label="Delivered" value={String(s.delivered)} tone="text-felt-ink" />
              <Cell label="Missing" value={String(s.missing)} tone="text-flag-ink" />
              <Cell label="Page unclear" value={String(s.deliveryUnclear)} tone="text-amber-ink" />
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
