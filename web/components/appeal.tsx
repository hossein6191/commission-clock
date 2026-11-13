"use client";

// The bonded appeal and the credit that pays its bond. AppealMark sits on a judged message of the
// thread: what an appeal came to, or how long the side it went against still has. AppealPanel is the
// room's panel for the latest judged press and delivery: the side a verdict went against writes one
// reason and puts up 0.1 GEN of credit; anyone else is told who may appeal and until when; and once a
// verdict was overturned both verdicts are shown. CreditPanel deposits to and withdraws from the
// caller's own credit, read with credit_of.

import * as React from "react";

import { Field } from "@/components/bits";
import { Brass } from "@/components/button";
import { TxStage } from "@/components/tx-stage";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WaitPanel, waitOf } from "@/components/wait-panel";
import { WalletGate } from "@/components/wallet-gate";
import { calls, creditOutcome, isMock, readCredit } from "@/lib/chain";
import { appealCheck, appealLeft, appealWords, openAppeal, type VerdictView } from "@/lib/appeal";
import { clockTime, gen, genText, span, tryAtto } from "@/lib/format";
import { sendingGuide, signGuide, verdictGuide, type Role } from "@/lib/guide";
import { APPEAL_BOND, APPEAL_WINDOW, MAX_REASON, plain, reasonProblem, type CommissionStatus, type Holder, type Side } from "@/lib/rules";
import { rememberTx } from "@/lib/tx-memory";
import type { Message, TxStatus } from "@/lib/types";
import { cx } from "@/lib/cx";

const sentence = (p: string) => (p ? p.charAt(0).toUpperCase() + p.slice(1) + "." : "");
const BOND = gen(APPEAL_BOND);

/** On a judged message: what its appeal came to, or the window still open on it. */
export function AppealMark({ m, latest, now, status }: { m: Message; latest: VerdictView | null; now: number; status: CommissionStatus }) {
  if (m.kind !== "say" && m.kind !== "deliver") return null;
  if (m.verdict === "noted" || m.verdict === "taken") return null;
  if (m.appeal) {
    const overturned = !!m.was;
    return (
      <div className={cx("mt-2 rounded-md border px-2.5 py-1.5 text-[12.5px] leading-snug", overturned ? "border-amber bg-amber-wash text-ink" : "border-line bg-table-2/60 text-ink-2")}>
        <p className="font-semibold">
          {overturned ? `Overturned on appeal by the ${m.appealRole}: first ${m.was}, now ${m.verdict}` : `Upheld on appeal by the ${m.appealRole}: ${m.verdict} stands`}
          {m.appeal === "changed" ? " (the page no longer read as it did when it was judged)" : ""}
        </p>
        {m.appealReason && <p className="mt-0.5 break-words text-ink-3">Reason: &ldquo;{m.appealReason}&rdquo;</p>}
        <p className="mt-0.5 text-ink-3">{overturned ? `The bond stayed with the ${m.appealRole}.` : `The ${BOND} bond went to the ${m.appealRole === "maker" ? "client" : "maker"}.`} An appeal is final.</p>
      </div>
    );
  }
  const own = latest && latest.message === m.id ? latest : null;
  const who = openAppeal(own, now, status);
  if (own && who) {
    return (
      <p className="mt-2 text-[12.5px] text-amber-ink">
        Appeal open to the {who}: {span(appealLeft(own, now))} left (until {clockTime(own.deadline, now)}).
      </p>
    );
  }
  return <p className="mt-2 text-[12px] text-ink-3">{own ? "Not appealed; the window has closed, so this verdict is final." : "Not appealed: final."}</p>;
}

/** The room's appeal panel: the latest judged press and delivery, who may appeal them and how. */
export function AppealPanel({
  id,
  role,
  status,
  press,
  delivery,
  now,
  holder,
  feeAtto,
  creditAtto,
  busy,
  onAppeal,
}: {
  id: string;
  role: Role;
  status: CommissionStatus;
  press: VerdictView | null;
  delivery: VerdictView | null;
  now: number;
  holder: Holder;
  feeAtto: string;
  /** the viewer's credit, "" while unknown */
  creditAtto: string;
  busy: boolean;
  onAppeal: (target: VerdictView, reason: string) => void;
}) {
  const [reason, setReason] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const open = [press, delivery].filter((v): v is VerdictView => !!v && !!openAppeal(v, now, status));
  const overturned = [press, delivery].filter((v): v is VerdictView => !!v && !!v.was);
  if (open.length === 0 && overturned.length === 0) return null;
  const party: Side | "visitor" = role === "visitor" ? "visitor" : role;
  const credit = creditAtto ? BigInt(creditAtto) : 0n;
  const check = appealCheck({ role: party, status, id, press, delivery, now, credit });
  const mine = party !== "visitor" && open.some((v) => v.appellant === party);
  const sent = plain(reason);
  const problem = reasonProblem(sent);

  return (
    <section aria-labelledby="appeal-title" className="sheet p-4 sm:p-5">
      <p className="kicker text-ink-3">The bonded appeal</p>
      <h2 id="appeal-title" className="mt-0.5 text-[24px]">
        {mine ? "A verdict went against you" : open.length ? "A verdict can still be appealed" : "Overturned on appeal"}
      </h2>
      <p className="mt-1 max-w-[62ch] text-[14px] text-ink-2">
        The side a verdict went against may appeal it once, within {APPEAL_WINDOW / 60} minutes, with one reason and a bond of {BOND} from its credit. The validators ask the
        same question again with that reason and the other side&apos;s last message added. A different verdict replaces the first and the bond stays; the same verdict moves the
        bond to the other side.
      </p>

      {overturned.map((v) => (
        <div key={v.message} className="mt-3 grid gap-2 rounded-lg border border-amber bg-amber-wash p-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="kicker text-ink-3">First verdict on {v.message}</p>
            <p className="stamp mt-1 !rotate-0 text-[12px] text-flag-ink line-through decoration-2">{v.was}</p>
          </div>
          <div className="min-w-0">
            <p className="kicker text-ink-3">On appeal by the {v.appealRole}</p>
            <p className="stamp mt-1 !rotate-0 text-[12px] text-felt">{v.verdict}</p>
          </div>
          <p className="text-[13px] text-ink-2 sm:col-span-2">{appealWords(v)} The move followed the new verdict as of the first verdict&apos;s time, the seconds in between charged to nobody.</p>
        </div>
      ))}

      {open.map((v) => (
        <WaitPanel
          key={v.message}
          className="mt-3"
          wait={waitOf(
            verdictGuide({
              role,
              commission: id,
              message: v.message,
              kind: v.kind === "deliver" ? "deliver" : "say",
              verdict: v.verdict,
              appellant: v.appellant,
              deadline: v.deadline,
              now,
              holder,
              feeAtto,
              creditAtto: party === v.appellant && creditAtto ? creditAtto : undefined,
            }),
          )}
        />
      ))}

      {mine && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (problem || busy || !check.ok) return;
            onAppeal(check.target, sent);
            setReason("");
            setTried(false);
          }}
        >
          <Field id="appeal-reason" label="Your reason" count={`${[...sent].length}/${MAX_REASON}`} hint="One or two plain sentences. The validators read it as your argument, fenced off from the brief." error={tried && problem ? sentence(problem) : ""}>
            <textarea id="appeal-reason" className="field min-h-[76px]" value={reason} maxLength={MAX_REASON + 40} onChange={(e) => setReason(e.target.value)} placeholder="Why the verdict is wrong" />
          </Field>
          <p className="mono mt-2 text-[12.5px] text-ink-3">
            Bond {BOND} · your credit {creditAtto ? gen(creditAtto) : "reading…"}
          </p>
          {!check.ok && <p className="mt-1.5 text-[13.5px] text-flag-ink">{check.why}</p>}
          <WalletGate what="to appeal">
            <Brass type="submit" className="mt-3" disabled={busy || !check.ok}>
              {check.ok ? `Appeal ${check.target.message}: put up ${BOND}` : "Appeal"}
            </Brass>
          </WalletGate>
        </form>
      )}
      {!mine && party !== "visitor" && open.length > 0 && !check.ok && <p className="mt-3 text-[13px] text-ink-3">{check.why}</p>}
    </section>
  );
}

/** The caller's credit on the contract: what pays an appeal's bond. Deposit and withdraw. */
export function CreditPanel({ address, onCredit }: { address: string; onCredit?: (creditAtto: string) => void }) {
  const credit = useRead(() => readCredit(address), [address], { enabled: !!address });
  const [amount, setAmount] = React.useState(genText(APPEAL_BOND));
  const [mode, setMode] = React.useState<"deposit" | "withdraw">("deposit");
  const [refused, setRefused] = React.useState("");
  const have = credit.data ? BigInt(credit.data.creditAtto || "0") : null;
  const atto = tryAtto(amount);
  const tx = useTx((s: TxStatus, hash: string) => {
    const out = creditOutcome(s);
    if (out) {
      rememberTx(address, hash, mode === "deposit" ? `Deposited ${gen(out.movedAtto)} as credit` : `Withdrew ${gen(out.movedAtto)} of credit`);
      setRefused("");
    } else if (s.result && s.result.ok === false) setRefused(String(s.result.reason ?? "The contract refused it; nothing moved."));
    void credit.refresh();
  });
  useAfterTx(() => void credit.refresh());
  const creditText = credit.data?.creditAtto;
  React.useEffect(() => {
    if (creditText !== undefined) onCredit?.(creditText);
  }, [creditText, onCredit]);

  const why =
    atto === null || atto <= 0n
      ? "The amount is a number of GEN above zero, like 0.1."
      : mode === "withdraw" && have !== null && atto > have
        ? `You hold ${gen(have)} of credit; a withdrawal is at most that.`
        : "";
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const amountText = atto !== null ? atto.toString() : "0";

  return (
    <section aria-labelledby="credit-title" className="sheet p-4 sm:p-5">
      <p className="kicker text-ink-3">Your credit</p>
      <h2 id="credit-title" className="mt-0.5 text-[22px]">
        {have === null ? "Credit for appeal bonds" : `${gen(have)} of credit`}
      </h2>
      <p className="mt-1 max-w-[62ch] text-[13.5px] text-ink-2">
        An appeal puts up {BOND} from this credit, never from your wallet directly. It belongs to you, not to any commission: deposit some before you need it, and withdraw what is
        left at any time. A bond lost on an appeal moves to the other side&apos;s credit.
      </p>
      {credit.error && <p className="mt-2 text-[13px] text-flag-ink">Could not read your credit: {credit.error}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Deposit or withdraw">
        <button type="button" className="chip" aria-pressed={mode === "deposit"} onClick={() => setMode("deposit")}>
          Deposit
        </button>
        <button type="button" className="chip" aria-pressed={mode === "withdraw"} onClick={() => setMode("withdraw")}>
          Withdraw
        </button>
      </div>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (why || busy || atto === null) return;
          void tx.start(mode === "deposit" ? calls.deposit(atto) : calls.withdraw(atto));
        }}
      >
        <label className="min-w-0 flex-1 basis-40">
          <span className="field-label">Amount, in GEN</span>
          <input className="field mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <WalletGate need={mode === "deposit" && atto !== null && atto > 0n ? atto : 0n} what={mode === "deposit" ? "to deposit" : "to withdraw"}>
          <Brass type="submit" disabled={busy || !!why}>
            {mode === "deposit" ? `Deposit ${atto !== null && atto > 0n ? gen(atto) : ""}` : `Withdraw ${atto !== null && atto > 0n ? gen(atto) : ""}`}
          </Brass>
        </WalletGate>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className="chip" onClick={() => setAmount(genText(APPEAL_BOND))}>
          One bond ({BOND})
        </button>
        {mode === "withdraw" && have !== null && have > 0n && (
          <button type="button" className="chip" onClick={() => setAmount(genText(have))}>
            All of it ({gen(have)})
          </button>
        )}
      </div>
      {why && amount.trim() !== "" && <p className="mt-1.5 text-[13px] text-flag-ink">{why}</p>}
      <TxStage
        tx={tx}
        sign={signGuide({ fn: mode, label: mode === "deposit" ? `Deposit ${gen(amountText)} as credit` : `Withdraw ${gen(amountText)} of credit`, amountAtto: amountText, mock: isMock })}
        sending={sendingGuide({ fn: mode, target: "", amountAtto: amountText, mock: isMock })}
        label={mode === "deposit" ? "Depositing credit" : "Withdrawing credit"}
      />
      {refused && (
        <p role="alert" className="mt-2 rounded-lg border-[1.5px] border-flag bg-flag-wash px-3 py-2 text-sm text-flag-ink">
          {refused}
        </p>
      )}
    </section>
  );
}
