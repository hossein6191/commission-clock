"use client";

// The maker's desk: open a studio with your own terms (every field has one-click suggestions, and a
// whole set of terms fills with one), then the requests waiting for you to accept or decline, your
// commissions as maker with whose move it is, and your studios.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Field, Section } from "@/components/bits";
import { Plunger } from "@/components/button";
import { ChessClock } from "@/components/chess-clock";
import { CommissionRow } from "@/components/commission-row";
import { Placeholder, ReadError } from "@/components/read-state";
import { Suggest } from "@/components/suggest";
import { TxStage } from "@/components/tx-stage";
import { useMe } from "@/components/use-me";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import { calls, isMock, openedStudio, readCommissionsOfWindow, readStudiosOf, studioPath } from "@/lib/chain";
import { stepsToCap } from "@/lib/rules";
import { durationLabel, gen, genText, pct, tryAtto } from "@/lib/format";
import { sendingGuide, signGuide } from "@/lib/guide";
import { MAX_ABOUT, MAX_NAME, MAX_TO_CAP, aboutProblem, nameProblem, plain, termsOfProblem } from "@/lib/rules";
import { ABOUT_CHIPS, CAP_CHIPS, CLIENT_SECONDS_CHIPS, CUT_CHIPS, FEE_CHIPS, MAKER_SECONDS_CHIPS, NAME_CHIPS, STEP_CHIPS, TERMS_CHIPS } from "@/lib/suggestions";
import { rememberTx } from "@/lib/tx-memory";
import type { TxStatus } from "@/lib/types";

const sentence = (p: string) => (p ? p.charAt(0).toUpperCase() + p.slice(1) + "." : "");

function OpenStudio() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [about, setAbout] = React.useState("");
  const [fee, setFee] = React.useState("1");
  const [maker, setMaker] = React.useState(3 * 3600);
  const [client, setClient] = React.useState(3600);
  const [step, setStep] = React.useState(900);
  const [cut, setCut] = React.useState(500);
  const [cap, setCap] = React.useState(4000);
  const [tried, setTried] = React.useState(false);
  const tx = useTx((s: TxStatus, hash: string) => {
    const id = openedStudio(s);
    if (id) {
      rememberTx(id, hash, "Opened the studio");
      router.push(studioPath(id));
    }
  });
  const n = plain(name);
  const a = plain(about);
  const feeAtto = tryAtto(fee);
  const terms = { feeAtto: feeAtto ?? -1n, makerSeconds: maker, clientSeconds: client, stepSeconds: step, cutBps: cut, maxCutBps: cap };
  const nameP = nameProblem(n);
  const aboutP = aboutProblem(a);
  const termsP = feeAtto === null ? "the fee is an amount of GEN like 0.5 or 2" : termsOfProblem(terms);
  const ok = !nameP && !aboutP && !termsP;
  const num = (v: string) => (/^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : 0);

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!ok || feeAtto === null) return;
        void tx.start(calls.openStudio(n, a, feeAtto, maker, client, step, cut, cap));
      }}
    >
      <Field id="name" label="Studio name" count={`${[...n].length}/${MAX_NAME}`} error={tried ? sentence(nameP) : ""}>
        <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
        <Suggest label="Suggested names" chips={NAME_CHIPS.map((x) => ({ label: x, value: x }))} onPick={setName} isOn={(v) => v === name} />
      </Field>
      <Field id="about" label="About (optional)" count={`${[...a].length}/${MAX_ABOUT}`} error={tried ? sentence(aboutP) : ""}>
        <input id="about" className="field" value={about} onChange={(e) => setAbout(e.target.value)} />
        <Suggest label="Suggested about lines" chips={ABOUT_CHIPS.map((x) => ({ label: x.split(",")[0].slice(0, 40), value: x }))} onPick={setAbout} isOn={(v) => v === about} />
      </Field>
      <div>
        <p className="field-label">The whole clock at once</p>
        <Suggest
          label="Suggested terms"
          chips={TERMS_CHIPS.map((t) => ({ label: t.label, value: t, tag: gen(t.feeAtto) }))}
          onPick={(t) => {
            setFee(genText(t.feeAtto));
            setMaker(t.makerSeconds);
            setClient(t.clientSeconds);
            setStep(t.stepSeconds);
            setCut(t.cutBps);
            setCap(t.maxCutBps);
          }}
          isOn={(t) => tryAtto(fee) === t.feeAtto && maker === t.makerSeconds && client === t.clientSeconds && step === t.stepSeconds && cut === t.cutBps && cap === t.maxCutBps}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="fee" label="Fee, in GEN">
          <input id="fee" className="field mono" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          <Suggest label="Suggested fees" chips={FEE_CHIPS} onPick={(v) => setFee(genText(v))} isOn={(v) => tryAtto(fee) === v} />
        </Field>
        <Field id="maker-s" label={`Your allowance, seconds (${durationLabel(maker)})`}>
          <input id="maker-s" className="field mono" inputMode="numeric" value={String(maker)} onChange={(e) => setMaker(num(e.target.value))} />
          <Suggest label="Suggested maker allowances" chips={MAKER_SECONDS_CHIPS} onPick={setMaker} isOn={(v) => v === maker} />
        </Field>
        <Field id="client-s" label={`The client's allowance, seconds (${durationLabel(client)})`}>
          <input id="client-s" className="field mono" inputMode="numeric" value={String(client)} onChange={(e) => setClient(num(e.target.value))} />
          <Suggest label="Suggested client allowances" chips={CLIENT_SECONDS_CHIPS} onPick={setClient} isOn={(v) => v === client} />
        </Field>
        <Field id="step" label={`A step of lateness, seconds (${durationLabel(step)})`}>
          <input id="step" className="field mono" inputMode="numeric" value={String(step)} onChange={(e) => setStep(num(e.target.value))} />
          <Suggest label="Suggested steps" chips={STEP_CHIPS} onPick={setStep} isOn={(v) => v === step} />
        </Field>
        <Field id="cut" label={`Cut per started step, basis points (${pct(cut)})`}>
          <input id="cut" className="field mono" inputMode="numeric" value={String(cut)} onChange={(e) => setCut(num(e.target.value))} />
          <Suggest label="Suggested cuts" chips={CUT_CHIPS} onPick={setCut} isOn={(v) => v === cut} />
        </Field>
        <Field id="cap" label={`The cut at most, basis points (${pct(cap)})`}>
          <input id="cap" className="field mono" inputMode="numeric" value={String(cap)} onChange={(e) => setCap(num(e.target.value))} />
          <Suggest label="Suggested caps" chips={CAP_CHIPS} onPick={setCap} isOn={(v) => v === cap} />
        </Field>
      </div>
      <p className="text-[14px] text-ink-2">
        {termsP ? (
          <span className="text-flag-ink">{sentence(termsP)}</span>
        ) : (
          <>
            The cut reaches its cap {durationLabel(stepsToCap(cut, cap) * step)} after your allowance runs out (the contract allows at most {durationLabel(MAX_TO_CAP)}), so a
            client whose maker goes silent can always cancel.
          </>
        )}
      </p>
      <WalletGate what="to open a studio">
        <Plunger type="submit" disabled={tx.sending || (!!tx.hash && !tx.final)} label="Press: open the studio, terms fixed for good" glyph={<span className="mono text-[12px]">OPEN</span>} />
      </WalletGate>
      <TxStage
        tx={tx}
        sign={signGuide({ fn: "open_studio", label: `Open ${n || "your studio"}`, mock: isMock })}
        sending={sendingGuide({ fn: "open_studio", target: "", title: n, mock: isMock })}
        label={`Opening ${n || "a studio"}`}
      />
      <div className="max-w-sm">
        <ChessClock
          size="md"
          holder="maker"
          maker={{ left: maker, used: 0, allowance: maker }}
          client={{ left: client, used: 0, allowance: client }}
          plate="Your clock, as every commission will start"
        />
      </div>
    </form>
  );
}

export default function MakerPage() {
  const me = useMe();
  const studios = useRead(() => readStudiosOf(me.address), [me.address], { enabled: !!me.address });
  const commissions = useRead(() => readCommissionsOfWindow(me.address, 3), [me.address], { enabled: !!me.address });
  useAfterTx(() => {
    void studios.refresh();
    void commissions.refresh();
  });
  const asMaker = (commissions.data?.rows ?? []).filter((c) => c.maker === me.address);
  const requests = asMaker.filter((c) => c.status === "requested");
  const running = asMaker.filter((c) => c.status !== "requested");
  // Someone with no studio yet sees the form first; a maker sees its requests first.
  const newcomer = !me.address || (!!studios.data && studios.data.rows.length === 0);
  const openSection = (
    <section aria-labelledby="open" className="sheet p-4 sm:p-6">
      <Section n={3} id="open" title="Open a studio" sub="Anyone may. The terms are fixed for good once it is open; you can close it to new commissions and reopen it later." />
      <OpenStudio />
    </section>
  );

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="kicker text-ink-3">The maker&apos;s desk</p>
        <h1 className="mt-1.5 text-[38px] sm:text-[52px]">Set your own clock</h1>
        <p className="mt-2 max-w-[64ch] text-[17px] text-ink-2">
          Open a studio with a fee and the terms of its clock. Clients commission it with exactly the fee, which the contract holds; you accept, and from then on the clock runs
          only while the move is yours.
        </p>
      </div>

      {newcomer && openSection}

      {me.address && (
        <section aria-labelledby="requests">
          <Section n={1} id="requests" title="Waiting for you to accept" sub="A request can be accepted within seven days; your clock starts the moment your acceptance lands." />
          {commissions.error ? (
            <ReadError detail={commissions.error} onRetry={commissions.retry} />
          ) : !commissions.data ? (
            <Placeholder lines={3} />
          ) : requests.length === 0 ? (
            <p className="text-ink-2">No request is waiting.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {requests.map((c) => (
                <CommissionRow key={c.id} c={c} me={me.address} mock={isMock} />
              ))}
            </ul>
          )}
        </section>
      )}

      {me.address && (
        <section aria-labelledby="as-maker">
          <Section n={2} id="as-maker" title="Your commissions as maker" sub="Newest first. The small clock shows whose move it is." />
          {!commissions.data ? (
            commissions.error ? null : <Placeholder lines={3} />
          ) : running.length === 0 ? (
            <p className="text-ink-2">None yet.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {running.map((c) => (
                <CommissionRow key={c.id} c={c} me={me.address} mock={isMock} />
              ))}
            </ul>
          )}
        </section>
      )}

      {!newcomer && openSection}

      {me.address && (
        <section aria-labelledby="yours">
          <Section n={4} id="yours" title="Your studios" />
          {studios.error ? (
            <ReadError detail={studios.error} onRetry={studios.retry} />
          ) : !studios.data ? (
            <Placeholder lines={2} />
          ) : studios.data.rows.length === 0 ? (
            <p className="text-ink-2">You have not opened a studio yet.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {studios.data.rows.map((s) => (
                <li key={s.id}>
                  <Link href={studioPath(s.id)} className="sheet block p-4 no-underline hover:border-walnut-light">
                    <p className="mono text-[13px] text-ink-3">
                      {s.id} · {s.accepting ? "taking commissions" : "closed"}
                    </p>
                    <p className="display mt-1 text-[20px] font-bold text-ink">{s.name}</p>
                    <p className="mt-1 text-[13.5px] text-ink-2">
                      {gen(s.feeAtto)} · {s.record.commissions} commissioned · {s.record.onTime} on time · {s.record.late} late
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
