"use client";

// Stages: the maker's stage rows when opening a studio (1 to 4 named stages, shares in basis points
// adding up to 10000, with a live preview of what the contract would make of them), and the stage
// track a studio or a commission draws on the walnut of the clock: each stage's name, share, status
// and what it released, the current one lit amber.

import * as React from "react";

import { Brass } from "@/components/button";
import { gen, pct } from "@/lib/format";
import { BPS, MAX_STAGE_ABOUT, MAX_STAGE_NAME } from "@/lib/rules";
import { MAX_STAGE_ROWS, STAGE_SETS, isStaged, previewStages, stageWord, type StageDraft, type StageView } from "@/lib/stages";
import { cx } from "@/lib/cx";

const sentence = (p: string) => (p ? p.charAt(0).toUpperCase() + p.slice(1) + "." : "");

/** The maker's stage rows. An empty list is one stage, the whole fee. */
export function StageEditor({ rows, onChange, feeAtto }: { rows: StageDraft[]; onChange: (rows: StageDraft[]) => void; feeAtto: bigint | null }) {
  const preview = previewStages(rows, feeAtto);
  const set = (i: number, patch: Partial<StageDraft>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const num = (v: string) => (/^\d{1,5}$/.test(v.trim()) ? Number(v.trim()) : 0);
  const same = (a: StageDraft[], b: StageDraft[]) => a.length === b.length && a.every((r, i) => r.name === b[i].name && r.bps === b[i].bps && r.about === b[i].about);
  return (
    <div>
      <p className="field-label">Stages: how the fee is paid out</p>
      <p className="mt-0.5 max-w-[64ch] text-[13.5px] text-ink-3">
        One stage means the whole fee is paid when the client accepts the work. With two to four, each stage has its own share, paid the moment the client accepts that stage;
        the validators judge every delivery against the stage that is current. Fixed for good once the studio is open.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Suggested stage sets">
        <button type="button" className="chip" aria-pressed={rows.length === 0} onClick={() => onChange([])}>
          One stage, the whole fee
        </button>
        {STAGE_SETS.map((s) => (
          <button key={s.label} type="button" className="chip" aria-pressed={same(rows, s.rows)} onClick={() => onChange(s.rows.map((r) => ({ ...r })))}>
            {s.label}
          </button>
        ))}
      </div>
      {rows.length > 0 && (
        <ol className="mt-3 flex flex-col gap-2.5">
          {rows.map((r, i) => (
            <li key={i} className="rounded-lg border border-line bg-card/70 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="kicker text-ink-3">Stage {i + 1}</span>
                <button type="button" className="link text-[12.5px] text-ink-3" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <label className="min-w-0">
                  <span className="sr-only">Stage {i + 1} name</span>
                  <input className="field" value={r.name} maxLength={MAX_STAGE_NAME + 10} placeholder="Name, e.g. Outline" onChange={(e) => set(i, { name: e.target.value })} />
                </label>
                <label className="min-w-0">
                  <span className="sr-only">Stage {i + 1} share in basis points</span>
                  <input className="field mono" inputMode="numeric" value={String(r.bps)} onChange={(e) => set(i, { bps: num(e.target.value) })} />
                </label>
              </div>
              <label className="mt-2 block">
                <span className="sr-only">What stage {i + 1} holds</span>
                <input className="field text-[14px]" value={r.about} maxLength={MAX_STAGE_ABOUT + 20} placeholder="What it holds (optional): the validators read this" onChange={(e) => set(i, { about: e.target.value })} />
              </label>
              <p className="mono mt-1 text-[12px] text-ink-3">
                {pct(r.bps)} of the fee{preview.shares[i] !== undefined ? ` = ${gen(preview.shares[i])}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {rows.length < MAX_STAGE_ROWS && (
          <Brass
            size="sm"
            variant="plain"
            onClick={() => {
              const left = Math.max(0, BPS - rows.reduce((t, r) => t + r.bps, 0));
              const start = rows.length === 0 ? [{ name: "The work", bps: BPS, about: "" }] : rows;
              onChange([...start, { name: "", bps: rows.length === 0 ? 0 : left, about: "" }]);
            }}
          >
            {rows.length === 0 ? "Split the fee into stages" : "Add a stage"}
          </Brass>
        )}
        {rows.length > 0 && (
          <span className={cx("mono text-[12.5px]", preview.total === BPS ? "text-felt-ink" : "text-flag-ink")}>
            {preview.total} of {BPS} basis points
          </span>
        )}
      </div>
      {preview.problem ? (
        <p className="mt-2 text-[13.5px] text-flag-ink">{sentence(preview.problem)}</p>
      ) : (
        <StageTrack
          className="mt-3"
          title="Preview: as every commission will start"
          stages={preview.stages.map((s, i) => ({
            k: i + 1,
            name: s.name,
            about: s.about,
            shareBps: s.bps,
            shareAtto: (preview.shares[i] ?? 0n).toString(),
            status: i === 0 ? "current" : "pending",
            releasedAtto: "0",
            cutAtto: "0",
            cutBps: 0,
            url: "",
            fp: "",
            deliveredBy: 0,
            closedAt: 0,
          }))}
          current={1}
          showAmounts={feeAtto !== null && feeAtto > 0n}
        />
      )}
    </div>
  );
}

/** A stage track: one cell per stage on walnut, the current one lit amber. */
export function StageTrack({
  stages,
  current,
  title,
  showAmounts = true,
  terms = false,
  className,
}: {
  stages: StageView[];
  current: number;
  title?: string;
  showAmounts?: boolean;
  /** a studio's terms, not a commission: no status on any stage */
  terms?: boolean;
  className?: string;
}) {
  if (stages.length === 0) return null;
  const n = stages.length;
  return (
    <section aria-label={title ?? "Stages"} className={cx("rounded-xl border border-walnut-deep bg-walnut p-2.5 text-card shadow-sm sm:p-3", className)}>
      <p className="px-1 text-[11px] font-bold tracking-[0.14em] text-brass-light uppercase">
        {title ?? (isStaged(n) ? `Paid in ${n} stages` : "Paid in one stage")}
      </p>
      <ol className={cx("mt-2 grid gap-2", n === 2 && "sm:grid-cols-2", n === 3 && "sm:grid-cols-3", n >= 4 && "sm:grid-cols-2 lg:grid-cols-4")}>
        {stages.map((s) => {
          const lit = !terms && s.k === current && s.status === "current";
          const paid = s.status !== "pending" && s.status !== "current" && s.status !== "closed" && BigInt(s.releasedAtto || "0") + BigInt(s.cutAtto || "0") > 0n;
          return (
            <li
              key={s.k}
              aria-current={lit ? "step" : undefined}
              className={cx(
                "min-w-0 rounded-lg border px-2.5 py-2",
                lit ? "border-amber bg-amber-wash text-ink shadow-[0_0_14px_rgba(255,207,115,0.45)]" : s.status === "accepted" ? "border-felt bg-felt-wash text-ink" : "border-walnut-light bg-walnut-deep/40 text-card",
              )}
            >
              <p className={cx("mono text-[11px] tracking-[0.08em] uppercase", lit || s.status === "accepted" ? "text-ink-3" : "text-brass-light")}>
                Stage {s.k} of {n} · {pct(s.shareBps)}
              </p>
              <p className="display mt-0.5 truncate text-[17px] font-bold" title={s.name}>
                {s.name}
              </p>
              {s.about && <p className={cx("mt-0.5 text-[12.5px] leading-snug break-words", lit || s.status === "accepted" ? "text-ink-2" : "text-card/80")}>{s.about}</p>}
              {showAmounts && <p className="mono mt-1 text-[12.5px]">{gen(s.shareAtto)}</p>}
              {!terms && <p className={cx("mt-1 text-[12.5px] font-semibold", lit ? "text-amber-ink" : s.status === "accepted" ? "text-felt-ink" : "text-card/85")}>{stageWord(s)}</p>}
              {paid && (
                <p className="mono mt-0.5 text-[11.5px] leading-snug opacity-90">
                  {gen(s.releasedAtto)} to the maker{BigInt(s.cutAtto || "0") > 0n ? `, ${gen(s.cutAtto)} back (cut ${pct(s.cutBps)})` : ""}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
