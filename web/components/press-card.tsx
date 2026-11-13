"use client";

// One message of the thread as an arbiter's card: who wrote it, when, what they wrote (or the page
// they delivered), and the stamp the network's verdict earned. A demo draft links to the copy this
// site serves, so a visitor can read what every validator read.

import { AppealMark } from "@/components/appeal";
import { Time } from "@/components/bits";
import { IconExternal, IconPage } from "@/components/icons";
import { draftOfUrl } from "@/lib/demo-studio";
import { pageName } from "@/lib/format";
import { stampOf, type StampTone } from "@/lib/receipt";
import type { VerdictView } from "@/lib/appeal";
import type { CommissionStatus, Side } from "@/lib/rules";
import type { Message } from "@/lib/types";
import { cx } from "@/lib/cx";

const TONE: Record<StampTone, string> = {
  counted: "text-felt",
  delivered: "text-felt",
  kept: "text-walnut",
  missing: "text-flag-ink",
  unclear: "text-amber-ink",
  noted: "text-ink-3",
  taken: "text-walnut-light",
};

export function PressCard({
  m,
  viewer,
  fresh,
  latest = null,
  now = 0,
  status = "active",
  stageName,
}: {
  m: Message;
  viewer: Side | "visitor";
  fresh?: boolean;
  /** the commission's latest judged press or delivery of this message's kind, whose appeal window may be open */
  latest?: VerdictView | null;
  now?: number;
  status?: CommissionStatus;
  /** on a commission paid in stages: the name of the stage that was current */
  stageName?: string;
}) {
  const stamp = stampOf(m, viewer);
  const mine = viewer === m.role;
  const draft = m.kind === "deliver" ? draftOfUrl(m.url) : null;
  return (
    <li className={cx("flex", m.role === "client" ? "justify-end" : "justify-start")}>
      <div className={cx("sheet w-full max-w-[34rem] px-3.5 py-3", m.role === "client" ? "rounded-tr-sm" : "rounded-tl-sm", mine && "border-walnut-light")}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-[12px] font-bold tracking-[0.12em] text-ink-3 uppercase">
            {m.role}
            {mine && <span className="ml-1 normal-case tracking-normal text-walnut">(you)</span>}
            <span className="mono ml-2 font-normal tracking-normal">#{m.n}</span>
          </p>
          <Time at={m.at} />
        </div>
        {m.kind === "say" && <p className="mt-1.5 text-[15px] break-words text-ink">{m.text}</p>}
        {stageName && m.kind !== "stage" && <p className="mono mt-0.5 text-[11.5px] text-ink-3">during stage {m.stage}: {stageName}</p>}
        {m.kind === "stage" && <p className="mt-1.5 text-[15px] text-ink">Accepted stage {m.text}</p>}
        {m.kind === "take" && <p className="mt-1.5 text-[15px] text-ink-2 italic">took the move onto itself</p>}
        {m.kind === "deliver" && (
          <div className="mt-1.5 text-[15px]">
            <p className="flex min-w-0 items-center gap-1.5 text-ink">
              <IconPage size={16} className="shrink-0 text-ink-3" />
              <span>Delivered</span>
              <a href={m.url} target="_blank" rel="noreferrer" className="mono link min-w-0 truncate text-[13.5px]" title={m.url}>
                {pageName(m.url) || m.url}
              </a>
            </p>
            {m.text && <p className="mt-1 break-words text-ink-2">&ldquo;{m.text}&rdquo;</p>}
            {draft && (
              <a href={`/drafts/${draft.file}`} target="_blank" rel="noreferrer" className="link mt-1 inline-flex items-center gap-1 text-[12.5px] text-ink-3">
                Read this site&apos;s copy of the page <IconExternal size={11} />
              </a>
            )}
          </div>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={cx("stamp", TONE[stamp.tone], fresh && "stamp-new")}>{stamp.text}</span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">{stamp.meaning}</p>
        <AppealMark m={m} latest={latest} now={now} status={status} />
      </div>
    </li>
  );
}
