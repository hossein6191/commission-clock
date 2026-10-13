// The settlement receipt of a commission: the fee, the clock as it stopped, the cut, and where every
// atto went, printed as an arbiter's result slip.

import { ENDINGS, settlementLines } from "@/lib/receipt";
import type { Commission } from "@/lib/types";
import { when } from "@/lib/format";

export function SettlementReceipt({ c }: { c: Commission }) {
  if (c.status === "requested" || c.status === "active") return null;
  const lines = settlementLines(c);
  return (
    <section aria-labelledby="receipt-title" className="sheet overflow-hidden">
      <div className="border-b border-dashed border-line-strong bg-table-2/60 px-4 py-3">
        <p className="kicker text-ink-3">Result slip · {c.id}</p>
        <h2 id="receipt-title" className="mt-0.5 text-[22px]">
          {ENDINGS[c.status]}
        </h2>
        {c.settledAt > 0 && <p className="mt-0.5 text-[13px] text-ink-3">Settled {when(c.settledAt)}, in one transaction.</p>}
      </div>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-4 py-3 text-[14.5px]">
        {lines.map((l) => (
          <div key={l.label} className="contents">
            <dt className={l.strong ? "border-t border-line pt-1.5 font-bold text-ink" : "pt-1.5 text-ink-2"}>{l.label}</dt>
            <dd className={l.strong ? "mono border-t border-line pt-1.5 text-right text-[16px] text-ink" : "mono pt-1.5 text-right text-ink-2"}>{l.value}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-line px-4 py-2.5 text-[13px] text-ink-3">The contract holds nothing for {c.id} any more: the maker and the client between them got the whole fee.</p>
    </section>
  );
}
