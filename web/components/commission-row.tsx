"use client";

// One commission in a list: its id and studio, its status, a small clock, and its state in one line,
// the same words its room's waiting panel leads with.

import Link from "next/link";

import { StatusPill } from "@/components/bits";
import { LiveClock, clockOf, useCommissionNow } from "@/components/chess-clock";
import { commissionPath } from "@/lib/chain";
import { gen } from "@/lib/format";
import { commissionLine, type Role } from "@/lib/guide";
import type { Commission } from "@/lib/types";

export function CommissionRow({ c, me, mock }: { c: Commission; me: string; mock?: boolean }) {
  const now = useCommissionNow(c);
  const role: Role = me && me === c.client ? "client" : me && me === c.maker ? "maker" : "visitor";
  const line = now
    ? commissionLine({
        role,
        now,
        id: c.id,
        status: c.status,
        clock: clockOf(c),
        feeAtto: c.feeAtto,
        deliveries: c.deliveries,
        requestedAt: c.requestedAt,
        makerPaidAtto: c.makerPaidAtto,
        clientPaidAtto: c.clientPaidAtto,
        makerLate: c.makerLate,
        cutBpsTotal: c.cutBpsTotal,
        mock,
      })
    : "";
  return (
    <li>
      <Link href={commissionPath(c.id)} className="sheet grid gap-3 p-3 no-underline hover:border-walnut-light sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="mono text-[15px] font-bold text-ink">{c.id}</span>
            <StatusPill status={c.status} />
            {role !== "visitor" && <span className="text-[12px] font-bold tracking-[0.08em] text-ink-3 uppercase">you are the {role}</span>}
          </p>
          <p className="mt-1 truncate text-[13.5px] text-ink-3">
            {c.studioName || c.studio} · {gen(c.feeAtto)}
          </p>
          <p className="mt-1 text-[14.5px] text-ink-2">{line}</p>
        </div>
        <LiveClock c={c} size="sm" />
      </Link>
    </li>
  );
}
