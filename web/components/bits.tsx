"use client";

// Small pieces every page uses: a section heading with its board square, a time that reads in the
// visitor's own zone, the transactions this browser sent for a commission or a studio, a form field,
// a status pill, a studio's terms, and the demo maker's state said plainly.

import * as React from "react";

import { Addr } from "@/components/addr";
import { IconExternal } from "@/components/icons";
import { useDemoStatus } from "@/components/use-demo";
import { useLocal } from "@/components/use-local";
import { useNow } from "@/components/use-now";
import { isMock, txUrl } from "@/lib/chain";
import { ago, durationLabel, gen, pct, when } from "@/lib/format";
import type { CommissionStatus } from "@/lib/rules";
import { parseRemembered, rememberedRaw } from "@/lib/tx-memory";
import type { Studio } from "@/lib/types";
import { cx } from "@/lib/cx";

/** A heading with a small board square in front of it, light or dark by its number. */
export function Section({ n, title, sub, id, className }: { n: number; title: string; sub?: React.ReactNode; id?: string; className?: string }) {
  return (
    <div className={cx("mb-4", className)}>
      <h2 id={id} className="flex items-center gap-2.5 text-[26px] sm:text-[30px]">
        <span aria-hidden="true" className={cx("inline-block size-5 shrink-0 rounded-[3px] border border-walnut", n % 2 ? "bg-walnut" : "bg-card")} />
        <span className="min-w-0">{title}</span>
      </h2>
      {sub && <p className="mt-1.5 max-w-[70ch] text-ink-2">{sub}</p>}
    </div>
  );
}

/** "3 min ago" with the full date in the title. */
export function Time({ at, className }: { at: number; className?: string }) {
  const now = useNow();
  if (!at) return null;
  return (
    <time dateTime={new Date(at * 1000).toISOString()} title={when(at)} className={cx("text-xs whitespace-nowrap text-ink-3", className)}>
      {now ? ago(at, now) : when(at)}
    </time>
  );
}

/** The transactions this browser sent for one commission or one studio, each linked to the explorer. */
export function TxList({ thing, empty }: { thing: string; empty?: string }) {
  const raw = useLocal(() => rememberedRaw(thing), "");
  const list = parseRemembered(raw);
  if (!list.length) return <p className="text-sm text-ink-3">{empty ?? "Nothing sent from this browser yet. Each transaction you send here is listed with its explorer link."}</p>;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {list.map((r) => (
        <li key={r.hash} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
          <span className="min-w-0">{r.label}</span>
          <span className="flex items-center gap-3">
            <Time at={r.at} />
            <a href={txUrl(r.hash)} target="_blank" rel="noreferrer" className="mono link inline-flex items-center gap-1 text-xs text-ink-2">
              {isMock ? "demo tx " : ""}
              {r.hash.slice(0, 10)}…
              <IconExternal size={12} />
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A field with its label, its counter and its error, and the suggestions under it. */
export function Field({ id, label, hint, count, error, children }: { id: string; label: string; hint?: React.ReactNode; count?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        {count && <span className="mono text-[11.5px] text-ink-3">{count}</span>}
      </div>
      {hint && <p className="mb-1 text-[13px] text-ink-3">{hint}</p>}
      <div className="mt-1">{children}</div>
      {error && (
        <p role="alert" className="mt-1 text-[13px] text-flag-ink">
          {error}
        </p>
      )}
    </div>
  );
}

const STATUS_WORDS: Record<CommissionStatus, { word: string; tone: string }> = {
  requested: { word: "requested", tone: "border-amber bg-amber-wash text-amber-ink" },
  active: { word: "on the clock", tone: "border-walnut bg-card text-walnut" },
  accepted: { word: "accepted", tone: "border-felt bg-felt-wash text-felt-ink" },
  accepted_by_silence: { word: "accepted by silence", tone: "border-felt bg-felt-wash text-felt-ink" },
  lapsed: { word: "lapsed", tone: "border-line-strong bg-table text-ink-2" },
  cancelled_late: { word: "cancelled late", tone: "border-flag bg-flag-wash text-flag-ink" },
  withdrawn: { word: "withdrawn", tone: "border-line-strong bg-table text-ink-2" },
  declined: { word: "declined", tone: "border-line-strong bg-table text-ink-2" },
};

export function StatusPill({ status, className }: { status: CommissionStatus; className?: string }) {
  const s = STATUS_WORDS[status];
  return <span className={cx("inline-flex items-center rounded-full border-[1.5px] px-2.5 py-0.5 text-[12px] font-bold whitespace-nowrap", s.tone, className)}>{s.word}</span>;
}

/** A studio's terms, as its card prints them: the fee, both allowances and the late cut. */
export function TermsList({ s, className }: { s: Pick<Studio, "feeAtto" | "makerSeconds" | "clientSeconds" | "stepSeconds" | "cutBps" | "maxCutBps" | "killBps">; className?: string }) {
  const rows: [string, string][] = [
    ["Fee", gen(s.feeAtto)],
    ["The maker's allowance", durationLabel(s.makerSeconds)],
    ["The client's allowance", durationLabel(s.clientSeconds)],
    ["Late cut", `${pct(s.cutBps)} per started ${durationLabel(s.stepSeconds).replace(/^1 /, "")} over`],
    ["Cut at most", pct(s.maxCutBps)],
    ["Kill fee", `${pct(s.killBps || 2500)}, if the client goes silent before any delivery`],
  ];
  return (
    <dl className={cx("grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[14px]", className)}>
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-ink-3">{k}</dt>
          <dd className="mono min-w-0 text-ink">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** The demo maker's state, said plainly: online and acting when its buttons are pressed, or offline and exactly why. */
export function DemoNote({ className }: { className?: string }) {
  const s = useDemoStatus();
  if (!s) return <p className={cx("text-sm text-ink-3", className)}>Asking the site&apos;s server about the demo maker…</p>;
  if (s.online)
    return (
      <div className={cx("text-sm text-ink-2", className)}>
        <p>
          <span aria-hidden="true" className="mr-1.5 inline-block size-2.5 rounded-full bg-felt align-middle" />
          The demo maker is at the table{s.maker && <> as <Addr address={s.maker} /></>}: it accepts your request and makes the moves its buttons name, nothing else.
        </p>
        {!s.drafts && (
          <p className="mt-1 text-amber-ink">
            It can talk but not deliver yet: {s.draftsReason}.
          </p>
        )}
      </div>
    );
  return (
    <div role="status" className={cx("rounded-xl border-[1.5px] border-amber bg-amber-wash px-3 py-2 text-sm", className)}>
      <p>
        <strong className="font-semibold">The demo maker is away:</strong> {s.reason}.
      </p>
      <p className="mt-0.5 text-ink-2">
        {s.studio
          ? "You can still commission the demo studio; nobody will accept it until the demo maker is back, and withdrawing always returns the whole fee."
          : "Every other studio on the contract still works, and you can open your own on the maker's desk."}
      </p>
    </div>
  );
}
