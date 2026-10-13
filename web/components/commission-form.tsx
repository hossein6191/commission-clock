"use client";

// Commissioning a studio: the brief, with its one-click suggestions, and the round plunger that sends
// exactly the studio's fee with it. The fee is held by the contract, not paid to the maker, until the
// commission settles. Once the request lands, its room opens by itself.

import * as React from "react";
import { useRouter } from "next/navigation";

import { Field } from "@/components/bits";
import { Plunger } from "@/components/button";
import { Suggest } from "@/components/suggest";
import { TxStage } from "@/components/tx-stage";
import { useMe } from "@/components/use-me";
import { useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import { calls, commissionPath, isMock, paidOutcome, requestedCommission } from "@/lib/chain";
import { gen } from "@/lib/format";
import { sendingGuide, signGuide } from "@/lib/guide";
import { MAX_BRIEF, briefProblem, plain } from "@/lib/rules";
import { BRIEF_CHIPS } from "@/lib/suggestions";
import { rememberTx } from "@/lib/tx-memory";
import type { Studio, TxStatus } from "@/lib/types";

export function CommissionForm({ s }: { s: Studio }) {
  const me = useMe();
  const router = useRouter();
  const [brief, setBrief] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [refused, setRefused] = React.useState("");
  const sent = plain(brief);
  const problem = briefProblem(sent);
  const fee = BigInt(s.feeAtto || "0");
  const tx = useTx((status: TxStatus, hash: string) => {
    const id = requestedCommission(status);
    if (id) {
      rememberTx(id, hash, `Commissioned ${s.id} for ${gen(fee)}`);
      router.push(commissionPath(id));
      return;
    }
    const p = paidOutcome(status);
    if (p.kind === "refused") setRefused(`${p.reason} ${gen(p.returnedAtto)} came back in the same transaction.`);
  });
  const mineToo = me.address && me.address === s.maker;

  if (mineToo) return <p className="text-sm text-ink-2">This is your own studio: a maker may not commission it. Switch to another account to play the client.</p>;
  if (!s.accepting) return <p className="text-sm text-ink-2">{s.id} is closed to new commissions; its maker may reopen it.</p>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        setRefused("");
        if (problem) return;
        void tx.start(calls.requestCommission(s.id, sent, fee));
      }}
      className="flex flex-col gap-4"
    >
      <Field id="brief" label="Your brief" count={`${[...sent].length}/${MAX_BRIEF}`} hint="What you want made, in one paragraph of plain text. The validators read it with every message." error={tried && problem ? problem.charAt(0).toUpperCase() + problem.slice(1) + "." : ""}>
        <textarea id="brief" className="field min-h-[110px]" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="A 150-word product description for…" />
        <Suggest label="Suggested briefs" chips={BRIEF_CHIPS} onPick={setBrief} isOn={(v) => v === brief} />
      </Field>
      <WalletGate need={fee} what="to commission this studio">
        <Plunger
          type="submit"
          disabled={tx.sending || (!!tx.hash && !tx.final)}
          label={`Press: commission ${s.id} for ${gen(fee)}`}
          glyph={<span className="mono text-[12px]">GEN</span>}
        />
      </WalletGate>
      <TxStage
        tx={tx}
        sign={signGuide({ fn: "request_commission", label: `Commission ${s.name} for ${gen(fee)}`, feeAtto: s.feeAtto, role: "client", mock: isMock })}
        sending={sendingGuide({ fn: "request_commission", target: s.id, title: s.name, feeAtto: s.feeAtto, role: "client", mock: isMock })}
        label={`Commissioning ${s.id}`}
      />
      {refused && (
        <p role="alert" className="rounded-lg border-[1.5px] border-flag bg-flag-wash px-3 py-2 text-sm text-flag-ink">
          {refused}
        </p>
      )}
    </form>
  );
}
