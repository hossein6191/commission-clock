"use client";

// Every commission the connected address is a party to, newest first: as client and as maker, each
// with its small clock and its state in one line. Nothing here signs anything.

import { Section } from "@/components/bits";
import { BrassLink } from "@/components/button";
import { CommissionRow } from "@/components/commission-row";
import { Placeholder, ReadError } from "@/components/read-state";
import { useMe } from "@/components/use-me";
import { useAfterTx, useRead } from "@/components/use-read";
import { WalletGate } from "@/components/wallet-gate";
import { isMock, readCommissionsOfWindow } from "@/lib/chain";

export default function MinePage() {
  const me = useMe();
  const list = useRead(() => readCommissionsOfWindow(me.address, 3), [me.address], { enabled: !!me.address });
  useAfterTx(() => void list.refresh());
  const rows = list.data?.rows ?? [];
  const asClient = rows.filter((c) => c.client === me.address);
  const asMaker = rows.filter((c) => c.maker === me.address);
  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="kicker text-ink-3">My commissions</p>
        <h1 className="mt-1.5 text-[38px] sm:text-[52px]">Whose move is it?</h1>
        <p className="mt-2 max-w-[62ch] text-[17px] text-ink-2">Every commission you are a party to. A lit face on the small clock is the side the clock runs against right now.</p>
      </div>
      {!me.address ? (
        <WalletGate what="to see your commissions">
          <span />
        </WalletGate>
      ) : list.error ? (
        <ReadError detail={list.error} onRetry={list.retry} />
      ) : !list.data ? (
        <Placeholder lines={6} />
      ) : (
        <>
          <section aria-labelledby="as-client">
            <Section n={1} id="as-client" title="As the client" />
            {asClient.length === 0 ? (
              <div className="sheet p-5">
                <p className="text-ink-2">You have not commissioned anyone yet.</p>
                <BrassLink href="/studio" className="mt-3">
                  Commission the demo studio
                </BrassLink>
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {asClient.map((c) => (
                  <CommissionRow key={c.id} c={c} me={me.address} mock={isMock} />
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="as-maker">
            <Section n={2} id="as-maker" title="As the maker" />
            {asMaker.length === 0 ? (
              <p className="text-ink-2">
                None. <BrassLink href="/maker" size="sm" variant="plain" className="ml-2">Open a studio</BrassLink>
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {asMaker.map((c) => (
                  <CommissionRow key={c.id} c={c} me={me.address} mock={isMock} />
                ))}
              </ul>
            )}
          </section>
          {list.data.partial && <p className="text-sm text-ink-3">The newest {rows.length} of {list.data.total} are shown.</p>}
        </>
      )}
    </div>
  );
}
