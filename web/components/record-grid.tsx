// A studio's public record as a grid of small counters: how its commissions ended, and what the
// network made of its presses and deliveries.

import { span } from "@/lib/format";
import type { StudioRecord } from "@/lib/types";
import { cx } from "@/lib/cx";

export function RecordGrid({ r, className }: { r: StudioRecord; className?: string }) {
  const cells: [string, string, string?][] = [
    ["Commissions", String(r.commissions)],
    ["On time", String(r.onTime), "text-felt-ink"],
    ["Late", String(r.late), "text-amber-ink"],
    ["Cancelled late", String(r.cancelledLate), "text-flag-ink"],
    ["Lapsed", String(r.lapsed)],
    ["Declined", String(r.declined)],
    ["Withdrawn", String(r.withdrawn)],
    ["Late, in all", span(r.lateSeconds)],
    ["Presses", String(r.presses)],
    ["Counted", String(r.passed), "text-felt-ink"],
    ["Not counted", String(r.kept)],
    ["Unclear", String(r.unclear), "text-amber-ink"],
    ["Pages read", String(r.deliveries)],
    ["Delivered", String(r.delivered), "text-felt-ink"],
    ["Missing", String(r.missing), "text-flag-ink"],
  ];
  return (
    <dl className={cx("grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3", className)}>
      {cells.map(([k, v, tone]) => (
        <div key={k} className="bg-card px-3 py-2">
          <dt className="text-[11.5px] font-bold tracking-[0.06em] text-ink-3 uppercase">{k}</dt>
          <dd className={cx("mono text-[18px] leading-tight", tone ?? "text-ink")}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
