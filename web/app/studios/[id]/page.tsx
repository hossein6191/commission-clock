"use client";

// One studio: its terms, fixed for good, its public record, its commissions newest first, the form
// that commissions it, and for its maker the switch that closes or reopens it to new commissions.

import * as React from "react";
import { useParams } from "next/navigation";

import { Addr } from "@/components/addr";
import { Section, TermsList, Time, TxList } from "@/components/bits";
import { Brass, BrassLink } from "@/components/button";
import { CommissionForm } from "@/components/commission-form";
import { CommissionRow } from "@/components/commission-row";
import { Placeholder, ReadError } from "@/components/read-state";
import { RecordGrid } from "@/components/record-grid";
import { TxStage } from "@/components/tx-stage";
import { useMe } from "@/components/use-me";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import { calls, isMock, readStudio, readStudioCommissionsWindow } from "@/lib/chain";
import { sendingGuide, signGuide } from "@/lib/guide";
import { parseStudioId } from "@/lib/rules";
import { rememberTx } from "@/lib/tx-memory";

export default function StudioPage() {
  const params = useParams<{ id: string }>();
  const id = parseStudioId(String(params?.id ?? ""));
  if (!id)
    return (
      <div className="sheet p-5">
        <h1 className="text-3xl">That is not a studio id</h1>
        <p className="mt-2 text-ink-2">Studios are S1, S2 and so on.</p>
        <BrassLink href="/studios" className="mt-4">
          Every studio
        </BrassLink>
      </div>
    );
  return <StudioView key={id} id={id} />;
}

function StudioView({ id }: { id: string }) {
  const me = useMe();
  const studio = useRead(() => readStudio(id), [id]);
  const list = useRead(() => readStudioCommissionsWindow(id, 2), [id]);
  useAfterTx(() => {
    void studio.refresh();
    void list.refresh();
  });
  const tx = useTx();
  const s = studio.data;
  if (studio.error) return <ReadError detail={studio.error} onRetry={studio.retry} />;
  if (!s)
    return studio.loading ? (
      <Placeholder lines={8} />
    ) : (
      <div className="sheet p-5">
        <h1 className="text-3xl">No studio {id}</h1>
        <p className="mt-2 text-ink-2">The contract holds no studio by that id.</p>
        <BrassLink href="/studios" className="mt-4">
          Every studio
        </BrassLink>
      </div>
    );
  const mine = !!me.address && me.address === s.maker;
  const toggle = s.accepting ? calls.closeStudio(s.id) : calls.reopenStudio(s.id);
  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="kicker text-ink-3">
          Studio {s.id} · opened <Time at={s.openedAt} className="!text-[12px] normal-case tracking-normal" />
        </p>
        <h1 className="mt-1.5 text-[38px] sm:text-[52px]">{s.name}</h1>
        {s.about && <p className="mt-2 max-w-[62ch] text-[17px] text-ink-2">{s.about}</p>}
        <p className="mt-2 text-sm text-ink-2">
          Maker <Addr address={s.maker} me={me.address} /> · {s.accepting ? "taking new commissions" : "closed to new commissions"}
        </p>
        {mine && (
          <div className="mt-4 flex flex-col gap-3">
            <WalletGate what="to change your studio">
              <Brass
                variant="plain"
                disabled={tx.sending || (!!tx.hash && !tx.final)}
                onClick={async () => {
                  const hash = await tx.start(toggle);
                  if (hash) rememberTx(s.id, hash, s.accepting ? "Closed to new commissions" : "Reopened to new commissions");
                }}
              >
                {s.accepting ? "Close to new commissions" : "Reopen to new commissions"}
              </Brass>
            </WalletGate>
            <TxStage
              tx={tx}
              sign={signGuide({ fn: toggle.fn, label: s.accepting ? `Close ${s.id} to new commissions` : `Reopen ${s.id}`, mock: isMock })}
              sending={sendingGuide({ fn: toggle.fn as "close_studio" | "reopen_studio", target: s.id, mock: isMock })}
              label={s.accepting ? `Closing ${s.id}` : `Reopening ${s.id}`}
            />
          </div>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section aria-labelledby="commission-it" className="sheet min-w-0 p-4 sm:p-6">
          <Section n={1} id="commission-it" title="Commission it" sub="The fee is held by the contract until the commission settles; withdraw before the maker accepts and all of it comes back." />
          <CommissionForm s={s} />
        </section>
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="terms" className="sheet p-4 sm:p-5">
            <h2 id="terms" className="text-[22px]">
              Its terms, fixed for good
            </h2>
            <TermsList s={s} className="mt-3" />
          </section>
          <section aria-labelledby="record" className="sheet p-4 sm:p-5">
            <h2 id="record" className="text-[22px]">
              Its record
            </h2>
            <RecordGrid r={s.record} className="mt-3" />
          </section>
        </div>
      </div>

      <section aria-labelledby="its-commissions">
        <Section n={2} id="its-commissions" title="Its commissions" sub="Newest first. Each one opens its room: the clock, the thread and the result slip." />
        {list.error ? (
          <ReadError detail={list.error} onRetry={list.retry} />
        ) : !list.data ? (
          <Placeholder lines={4} />
        ) : list.data.rows.length === 0 ? (
          <p className="text-ink-2">Nobody has commissioned {s.id} yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {list.data.rows.map((c) => (
              <CommissionRow key={c.id} c={c} me={me.address} mock={isMock} />
            ))}
          </ul>
        )}
      </section>

      {mine && (
        <section aria-labelledby="sent">
          <h2 id="sent" className="text-[20px]">
            Sent from this browser
          </h2>
          <div className="mt-2">
            <TxList thing={s.id} />
          </div>
        </section>
      )}
    </div>
  );
}
