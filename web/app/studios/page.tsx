"use client";

// Every studio on the contract, newest first: its maker, its terms in one line, whether it takes new
// commissions, and how its commissions have ended.

import Link from "next/link";

import { Addr } from "@/components/addr";
import { Section } from "@/components/bits";
import { BrassLink } from "@/components/button";
import { Placeholder, ReadError } from "@/components/read-state";
import { useMe } from "@/components/use-me";
import { useAfterTx, useRead } from "@/components/use-read";
import { readStudiosWindow, studioPath } from "@/lib/chain";
import { durationLabel, gen, pct } from "@/lib/format";

export default function StudiosPage() {
  const me = useMe();
  const list = useRead(() => readStudiosWindow(3), []);
  useAfterTx(() => void list.refresh());
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="kicker text-ink-3">Studios</p>
        <h1 className="mt-1.5 text-[38px] sm:text-[50px]">Every studio at the table</h1>
        <p className="mt-2 max-w-[62ch] text-ink-2">Each one fixed its fee and its clock for good when it opened. Its record is the contract&apos;s own count of how its commissions ended.</p>
      </div>
      {list.error ? (
        <ReadError detail={list.error} onRetry={list.retry} />
      ) : !list.data ? (
        <Placeholder lines={6} />
      ) : list.data.rows.length === 0 ? (
        <div className="sheet p-5">
          <p className="text-ink-2">No studio has opened yet.</p>
          <BrassLink href="/maker" className="mt-3">
            Open the first one
          </BrassLink>
        </div>
      ) : (
        <section aria-labelledby="all">
          <Section n={1} id="all" title={`${list.data.total} ${list.data.total === 1 ? "studio" : "studios"}`} sub={list.data.partial ? "The newest are shown; older pages are on the contract." : undefined} />
          <ul className="grid gap-3 md:grid-cols-2">
            {list.data.rows.map((s) => (
              <li key={s.id}>
                <Link href={studioPath(s.id)} className="sheet block h-full p-4 no-underline hover:border-walnut-light">
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className="mono text-[13px] text-ink-3">{s.id}</span>
                    <span className={s.accepting ? "text-[12.5px] font-bold text-felt-ink" : "text-[12.5px] font-bold text-ink-3"}>{s.accepting ? "taking commissions" : "closed to new commissions"}</span>
                  </p>
                  <p className="display mt-1 text-[22px] leading-tight font-bold text-ink">{s.name}</p>
                  {s.about && <p className="mt-1 text-[14px] text-ink-2">{s.about}</p>}
                  <p className="mono mt-2 text-[13px] text-ink-2">
                    {gen(s.feeAtto)} · maker {durationLabel(s.makerSeconds)} · client {durationLabel(s.clientSeconds)} · {pct(s.cutBps)}/{durationLabel(s.stepSeconds).replace(/^1 /, "")} late, max{" "}
                    {pct(s.maxCutBps)}
                  </p>
                  <p className="mt-2 text-[13px] text-ink-3">
                    {s.record.commissions} commissioned · {s.record.onTime} on time · {s.record.late} late · {s.record.cancelledLate} cancelled late · by <Addr address={s.maker} me={me.address} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
