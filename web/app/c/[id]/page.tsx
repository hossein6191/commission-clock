"use client";

// One commission's room. The walnut clock ticking for whichever side holds the move; one waiting panel
// that says what is happening, who the clock runs against, what is needed from you and where the fee
// is, with the settlement buttons that are open right now; the thread, every judged message stamped
// with its verdict; the composer for the two parties; the demo maker's next moves on a commission of
// the demo studio, from the script of the demo job its brief is (or why there are none); a waiting
// panel while the validators judge a press or read a draft page; and the result slip once it settles. Every transaction shows its explorer link from the first second.
//
// Contract version 2: a commission paid in stages draws its stage track under the clock, and the client
// accepts each delivered stage (accept_stage; accept_work on one stage). The latest judged press and
// delivery carry their appeal window: the side a verdict went against may appeal it once, with a reason
// and a 0.1 GEN bond from its credit, which the credit panel deposits and withdraws.

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Addr } from "@/components/addr";
import { AppealPanel, CreditPanel } from "@/components/appeal";
import { StatusPill, TxList, DemoNote } from "@/components/bits";
import { Brass, BrassLink } from "@/components/button";
import { LiveClock, clockOf, useCommissionNow } from "@/components/chess-clock";
import { Composer } from "@/components/composer";
import { DemoMoves, OffScriptNote } from "@/components/demo-moves";
import { PressCard } from "@/components/press-card";
import { Placeholder, ReadError } from "@/components/read-state";
import { SettlementReceipt } from "@/components/settlement";
import { StageTrack } from "@/components/stages";
import { TxStage } from "@/components/tx-stage";
import { useDemoStatus } from "@/components/use-demo";
import { useMe } from "@/components/use-me";
import { useWallNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WaitPanel, waitOf } from "@/components/wait-panel";
import { WalletGate } from "@/components/wallet-gate";
import { appealOutcome, calls, isMock, pressOutcome, readCommission, readMessages, readStudio, requestDemoAccept, requestDemoAct, studioPath, unsettledWhy } from "@/lib/chain";
import { cancelOpensIn, silenceOpensIn } from "@/lib/clock";
import { redeliverWaitsUntil, settleWaitsUntil, type VerdictView } from "@/lib/appeal";
import { settleSplits } from "@/lib/stages";
import { STAGED_STUDIO_NAME, draftOf, draftOfUrl, isDemoStudio, jobOfBrief, stagedJobOfBrief, type DemoAction } from "@/lib/demo-studio";
import { clockTime, gen, pageName, span } from "@/lib/format";
import { appealGuide, commissionGuide, demoGuide, judgeGuide, noteGuide, readGuide, sendingGuide, signGuide, type Guide, type Role } from "@/lib/guide";
import { ACCEPT_WINDOW, PAGE, parseCommissionId, type Side } from "@/lib/rules";
import { rememberTx } from "@/lib/tx-memory";
import type { Call, Commission, Message, Paged, TxStatus } from "@/lib/types";

const LATE_AFTER = 360;

export default function CommissionPage() {
  const params = useParams<{ id: string }>();
  const id = parseCommissionId(String(params?.id ?? ""));
  if (!id)
    return (
      <div className="sheet p-5">
        <h1 className="text-3xl">That is not a commission id</h1>
        <p className="mt-2 text-ink-2">Commissions are C1, C2 and so on. Yours are under My commissions.</p>
        <BrassLink href="/mine" className="mt-4">
          My commissions
        </BrassLink>
      </div>
    );
  return <Room key={id} id={id} />;
}

/** What one transaction of this room is doing, for its waiting panel. */
type Doing = { call: Call; label: string; sign: Guide; sending: Guide; judged: boolean; presser?: Side; appeal?: { kind: "say" | "deliver"; verdict: string } };

function Room({ id }: { id: string }) {
  const me = useMe();
  const wall = useWallNow();
  const commission = useRead<Commission | null>(() => readCommission(id), [id]);
  const c = commission.data;
  const total = c?.messages ?? 0;
  const start = Math.max(0, total - PAGE);
  const thread = useRead<Paged<Message>>(() => readMessages(id, start, PAGE), [id, start, total], { enabled: !!c });
  const [earlier, setEarlier] = React.useState<Message[]>([]);
  const studio = useRead(() => readStudio(c!.studio), [c?.studio ?? ""], { enabled: !!c });
  const demo = useDemoStatus();
  const now = useCommissionNow(c);
  const [doing, setDoing] = React.useState<Doing | null>(null);
  const [freshMessage, setFreshMessage] = React.useState("");
  const [credit, setCredit] = React.useState("");
  const [demoAsk, setDemoAsk] = React.useState<{ what: string; reason?: string; state: "asking" | "failed" } | null>(null);

  useAfterTx(() => {
    void commission.refresh();
    void thread.refresh();
  });

  const tx = useTx((s: TxStatus, hash: string, call: Call) => {
    const out = pressOutcome(s);
    if (out?.message) setFreshMessage(out.message);
    const ap = appealOutcome(s);
    if (ap) setFreshMessage(ap.message);
    const why = unsettledWhy(s);
    if (why) rememberTx(id, hash, `${call.fn === "deliver" ? "Delivery" : call.fn === "appeal" ? "Appeal" : "Message"} stored nothing: ${why}`);
  });

  if (commission.error) return <ReadError detail={commission.error} onRetry={commission.retry} />;
  if (!c)
    return commission.loading ? (
      <Placeholder lines={10} />
    ) : (
      <div className="sheet p-5">
        <h1 className="text-3xl">No commission {id}</h1>
        <p className="mt-2 text-ink-2">The contract holds no commission by that id.</p>
        <BrassLink href="/mine" className="mt-4">
          My commissions
        </BrassLink>
      </div>
    );

  const role: Role = me.address && me.address === c.client ? "client" : me.address && me.address === c.maker ? "maker" : "visitor";
  const party: Side | null = role === "visitor" ? null : role;
  const clock = clockOf(c);
  const fee = BigInt(c.feeAtto || "0");
  const t = now || c.now;
  const isDemo = !!demo && !!studio.data && (demo.studio === c.studio || isDemoStudio(studio.data, demo.maker));
  // The demo maker plays only its demo briefs, word for word: the studio and the brief pick its script.
  const stagedStudio = studio.data?.name === STAGED_STUDIO_NAME;
  const job = stagedStudio ? stagedJobOfBrief(c.brief) : jobOfBrief(c.brief);
  const demoJob = isDemo && !!job;
  // Stages: the current one, its share, whether a delivery stands for it, and what is still held.
  const staged = c.nStages > 1;
  const cur = c.stages[c.stage - 1];
  const last = c.stage >= c.nStages;
  const delivered = cur ? cur.deliveredBy > 0 : c.deliveries > 0;
  const held = c.status === "active" ? BigInt(c.heldAtto || c.feeAtto || "0") : fee;
  const shareAtto = cur ? BigInt(cur.shareAtto || "0") : held;
  const stageInfo = cur ? { k: c.stage, n: c.nStages, name: cur.name } : undefined;
  const stageLabel = staged && cur ? `stage ${c.stage} of ${c.nStages} (${cur.name})` : "";
  const splits = settleSplits(clock, held, shareAtto, delivered, last, t);
  const lastDeliveryN = c.lastDelivery?.n ?? 0;
  const busy = tx.sending || (!!tx.hash && !tx.final) || demoAsk?.state === "asking";
  const guideInput = {
    role,
    now: t,
    id: c.id,
    status: c.status,
    clock,
    feeAtto: c.feeAtto,
    deliveries: c.deliveries,
    requestedAt: c.requestedAt,
    makerPaidAtto: c.makerPaidAtto,
    clientPaidAtto: c.clientPaidAtto,
    makerLate: c.makerLate,
    cutBpsTotal: c.cutBpsTotal,
    demo: demoJob,
    mock: isMock,
    stage: staged ? stageInfo : undefined,
    stageDelivered: delivered,
    heldAtto: held.toString(),
    shareAtto: shareAtto.toString(),
    settleWaitsUntil: party ? settleWaitsUntil(c.lastPress, c.lastDelivery, party, t, c.status) : 0,
  };
  const stage: "busy" | "late" = wall && tx.at && wall - tx.at > LATE_AFTER ? "late" : "busy";

  const run = async (d: Doing) => {
    setDoing(d);
    setDemoAsk(null);
    const hash = await tx.start(d.call);
    if (hash) rememberTx(id, hash, d.label);
  };

  const askDemo = async (what: string, call: Call, label: string, judged: boolean, sending: Guide, ask: () => ReturnType<typeof requestDemoAct>) => {
    // The demo maker signs with its own key: the move it makes is the maker's.
    tx.reset();
    setDemoAsk({ what, state: "asking" });
    const answer = await ask();
    if (!answer.ok) {
      setDemoAsk({ what, state: "failed", reason: answer.reason });
      return;
    }
    setDemoAsk(null);
    setDoing({ call, label, sign: sending, sending, judged, presser: "maker" });
    tx.track(answer.hash, call);
    rememberTx(id, answer.hash, label);
  };

  const onDemoAct = (a: DemoAction) => {
    const call: Call = a.kind === "say" ? calls.say(c.id, a.text) : calls.deliver(c.id, draftOf(a.draft!, a.job).file, a.text);
    const sending =
      a.kind === "say"
        ? c.holder === "maker"
          ? judgeGuide({ role, commission: c.id, presser: "maker", feeAtto: c.feeAtto, stage: "busy", mock: isMock })
          : noteGuide({ role, commission: c.id, sender: "maker", holder: c.holder, feeAtto: c.feeAtto, mock: isMock })
        : readGuide({ role, commission: c.id, page: draftOf(a.draft!, a.job).file, feeAtto: c.feeAtto, holder: c.holder, stage: "busy", mock: isMock });
    void askDemo(a.label, call, `Demo maker: ${a.label.toLowerCase()}`, a.kind === "deliver" || c.holder === "maker", sending, () => requestDemoAct(c.id, a.key));
  };

  const onDemoAccept = () => {
    const call = calls.accept(c.id);
    void askDemo("accepting the request", call, "Demo maker accepted", false, sendingGuide({ fn: "accept", target: c.id, feeAtto: c.feeAtto, role, mock: isMock }), () => requestDemoAccept(c.id));
  };

  // ---- the settlement buttons open right now ----
  const actions: React.ReactNode[] = [];
  const settle = (fn: "accept_work" | "accept_stage" | "claim_silence" | "cancel_late", call: Call, label: string, split: { toMaker: bigint; toClient: bigint }) => {
    const more = { stage: staged ? stageInfo : undefined, heldAtto: held.toString() };
    void run({
      call,
      label,
      judged: false,
      sign: signGuide({ fn, label, feeAtto: c.feeAtto, toMakerAtto: split.toMaker.toString(), toClientAtto: split.toClient.toString(), holder: c.holder, role, mock: isMock, ...more }),
      sending: sendingGuide({ fn, target: c.id, feeAtto: c.feeAtto, toMakerAtto: split.toMaker.toString(), toClientAtto: split.toClient.toString(), holder: c.holder, role, mock: isMock, ...more }),
    });
  };
  const onAppeal = (target: VerdictView, reason: string) =>
    void run({
      call: calls.appeal(c.id, reason),
      label: `Appeal of ${target.message} (${target.verdict})`,
      judged: true,
      presser: party ?? undefined,
      appeal: { kind: target.kind === "deliver" ? "deliver" : "say", verdict: target.verdict },
      sign: signGuide({ fn: "appeal", label: `Appeal the verdict on ${target.message} with a 0.1 GEN bond`, feeAtto: c.feeAtto, holder: c.holder, role, mock: isMock }),
      sending: appealGuide({ role, commission: c.id, appellant: party ?? "maker", kind: target.kind === "deliver" ? "deliver" : "say", verdict: target.verdict, holder: c.holder, feeAtto: c.feeAtto, stage: "busy", mock: isMock }),
    });
  if (c.status === "requested") {
    if (role === "client")
      actions.push(
        <Brass
          key="withdraw"
          variant="plain"
          disabled={busy}
          onClick={() =>
            void run({
              call: calls.withdrawRequest(c.id),
              label: `Withdrawing ${c.id}`,
              judged: false,
              sign: signGuide({ fn: "withdraw_request", label: `Withdraw ${c.id} and take back ${gen(c.feeAtto)}`, feeAtto: c.feeAtto, role, mock: isMock }),
              sending: sendingGuide({ fn: "withdraw_request", target: c.id, feeAtto: c.feeAtto, role, mock: isMock }),
            })
          }
        >
          Withdraw: the whole fee back
        </Brass>,
      );
    if (role === "maker") {
      const tooLate = t - c.requestedAt > ACCEPT_WINDOW;
      actions.push(
        <Brass
          key="accept"
          disabled={busy || tooLate}
          onClick={() =>
            void run({
              call: calls.accept(c.id),
              label: `Accepting ${c.id}`,
              judged: false,
              sign: signGuide({ fn: "accept", label: `Accept ${c.id}: your clock starts`, feeAtto: c.feeAtto, role, mock: isMock }),
              sending: sendingGuide({ fn: "accept", target: c.id, feeAtto: c.feeAtto, role, mock: isMock }),
            })
          }
        >
          Accept: start the clock
        </Brass>,
        <Brass
          key="decline"
          variant="plain"
          disabled={busy}
          onClick={() =>
            void run({
              call: calls.decline(c.id),
              label: `Declining ${c.id}`,
              judged: false,
              sign: signGuide({ fn: "decline", label: `Decline ${c.id}`, feeAtto: c.feeAtto, role, mock: isMock }),
              sending: sendingGuide({ fn: "decline", target: c.id, feeAtto: c.feeAtto, role, mock: isMock }),
            })
          }
        >
          Decline: the fee goes back
        </Brass>,
      );
    }
    if (role === "client" && demoJob && demo?.online)
      actions.unshift(
        <Brass key="demo-accept" disabled={busy} onClick={onDemoAccept}>
          Ask the demo maker to accept
        </Brass>,
      );
  }
  if (c.status === "active") {
    if (role === "client" && delivered) {
      const split = splits.accept;
      actions.push(
        staged ? (
          <Brass key="accept-stage" disabled={busy} onClick={() => settle("accept_stage", calls.acceptStage(c.id), `Accepting stage ${c.stage} (${cur?.name ?? ""}) on ${c.id}`, split)}>
            {last ? `Accept the last stage: ${gen(split.toMaker)} to the maker, settled` : `Accept stage ${c.stage}: ${gen(split.toMaker)} to the maker now`}
          </Brass>
        ) : (
          <Brass key="accept-work" disabled={busy} onClick={() => settle("accept_work", calls.acceptWork(c.id), `Accepting the work on ${c.id}`, split)}>
            Accept the work: {gen(split.toMaker)} to the maker
          </Brass>
        ),
      );
    }
    // A settlement against a side waits while that side may still appeal a verdict on the settler's own message.
    const waitFor = (who: Side) => Math.max(0, settleWaitsUntil(c.lastPress, c.lastDelivery, who, t, c.status) - t);
    if (role === "client" && c.holder === "maker") {
      const opens = Math.max(cancelOpensIn(clock, t), waitFor("client"));
      const split = splits.cancel;
      actions.push(
        <Brass key="cancel" variant="danger" disabled={busy || opens > 0} onClick={() => settle("cancel_late", calls.cancelLate(c.id), `Cancelling ${c.id} late`, split)}>
          {opens > 0 ? `Cancel late: opens in ${span(opens)}` : `Cancel late: ${gen(split.toClient)} back to you`}
        </Brass>,
      );
    }
    if (role === "maker" && c.holder === "client") {
      const opens = Math.max(silenceOpensIn(clock, t), waitFor("maker"));
      const split = splits.silence;
      actions.push(
        <Brass key="silence" variant="danger" disabled={busy || opens > 0} onClick={() => settle("claim_silence", calls.claimSilence(c.id), `Claiming the client's silence on ${c.id}`, split)}>
          {opens > 0 ? `Claim silence: opens in ${span(opens)}` : `Claim the client's silence: ${gen(split.toMaker)} to you`}
        </Brass>,
      );
    }
  }

  const guide = commissionGuide(guideInput);
  const rows = [...earlier, ...(thread.data?.rows ?? [])];
  const seen = new Set<string>();
  const messages = rows.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  const hidden = Math.max(0, total - messages.length);

  const loadEarlier = async () => {
    const first = messages[0]?.n ?? total + 1;
    const from = Math.max(0, first - 1 - PAGE);
    try {
      const page = (await readMessages(id, from, Math.min(PAGE, first - 1 - from))).data;
      setEarlier((prev) => [...page.rows, ...prev]);
    } catch {
      /* the button stays; the next press asks again */
    }
  };

  const viewerSide: Side | "visitor" = party ?? "visitor";
  // The maker may not deliver over a delivered page for this stage while the client may still appeal it and has written nothing since.
  const clientWroteSince = messages.some((m) => m.role === "client" && m.n > lastDeliveryN);
  const redeliverUntil = redeliverWaitsUntil(c.lastDelivery, c.stages.length ? (messages.find((m) => m.n === lastDeliveryN)?.stage ?? c.stage) : c.stage, c.stage, clientWroteSince, t, c.status);
  const deliverWait =
    redeliverUntil > t
      ? `The client may appeal the page delivered for this stage until ${clockTime(redeliverUntil, t)} (${span(redeliverUntil - t)} from now). You can deliver again once that window closes, the client writes, or it is appealed.`
      : "";

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-start">
        <div className="min-w-0">
          <p className="kicker flex flex-wrap items-center gap-x-2 text-ink-3">
            <span>Commission {c.id}</span>·
            {staged && <span>Stage {c.stage} of {c.nStages}</span>}
            {staged && "·"}
            <Link className="link normal-case tracking-normal" href={studioPath(c.studio)}>
              {c.studioName || c.studio}
            </Link>
          </p>
          <h1 className="mt-1.5 text-[34px] sm:text-[46px]">
            {c.status === "active" ? (c.holder === party ? "Your move." : `The ${c.holder}'s move.`) : c.status === "requested" ? "Waiting to be accepted." : "Settled."}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
            <StatusPill status={c.status} />
            <span>
              Fee <span className="mono text-ink">{gen(c.feeAtto)}</span>
            </span>
            <span>
              Client <Addr address={c.client} me={me.address} />
            </span>
            <span>
              Maker <Addr address={c.maker} me={me.address} />
            </span>
          </div>
          <div className="sheet mt-4 px-4 py-3">
            <p className="kicker text-ink-3">The brief</p>
            <p className="mt-1 text-[15.5px] break-words text-ink">{c.brief}</p>
          </div>
        </div>
        <LiveClock c={c} />
      </div>

      {staged && <StageTrack stages={c.status === "requested" ? c.stages.map((x) => ({ ...x, status: "pending" })) : c.stages} current={c.status === "active" ? c.stage : 0} />}

      {doing && (tx.hash || tx.sending || tx.error) ? (
        <TxStage
          tx={tx}
          sign={doing.sign}
          sending={
            doing.judged && doing.call.fn === "say"
              ? judgeGuide({ role, commission: c.id, presser: doing.presser ?? party ?? "maker", feeAtto: c.feeAtto, stage, mock: isMock })
              : doing.appeal
                ? appealGuide({ role, commission: c.id, appellant: doing.presser ?? "maker", kind: doing.appeal.kind, verdict: doing.appeal.verdict, holder: c.holder, feeAtto: c.feeAtto, stage, mock: isMock })
                : doing.judged && doing.call.fn === "deliver"
                ? readGuide({ role, commission: c.id, page: pageName(String(doing.call.args[1])) || String(doing.call.args[1]), feeAtto: c.feeAtto, holder: c.holder, stage, mock: isMock })
                : doing.sending
          }
          label={doing.label}
          judged={doing.judged}
        />
      ) : null}
      {demoAsk && <WaitPanel wait={waitOf(demoGuide({ state: demoAsk.state, what: demoAsk.what, commission: c.id, holder: c.holder, feeAtto: c.feeAtto, reason: demoAsk.reason, mock: isMock }))} />}

      {!(doing && tx.hash && !tx.final) && (
        <WaitPanel
          wait={waitOf(guide, {
            action: actions.length ? (
              <WalletGate what="to act on this commission">
                <div className="flex flex-wrap gap-2">{actions}</div>
              </WalletGate>
            ) : undefined,
          })}
        />
      )}

      <AppealPanel
        id={c.id}
        role={role}
        status={c.status}
        press={c.lastPress}
        delivery={c.lastDelivery}
        now={t}
        holder={c.holder}
        feeAtto={c.feeAtto}
        creditAtto={credit}
        busy={busy}
        onAppeal={onAppeal}
      />

      <SettlementReceipt c={c} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <section aria-labelledby="thread-title" className="min-w-0">
          <h2 id="thread-title" className="text-[26px]">
            The thread
          </h2>
          <p className="mt-1 text-[14px] text-ink-2">
            {total === 0 ? "No messages yet." : `${total} ${total === 1 ? "message" : "messages"}, oldest first. Every press is stamped with what the network agreed.`}
          </p>
          {hidden > 0 && (
            <Brass size="sm" variant="plain" className="mt-3" onClick={() => void loadEarlier()}>
              Show {Math.min(hidden, PAGE)} earlier
            </Brass>
          )}
          {thread.error ? (
            <ReadError className="mt-3" detail={thread.error} onRetry={thread.retry} />
          ) : thread.loading && !thread.data ? (
            <Placeholder className="mt-3" lines={4} />
          ) : (
            <ol className="mt-3 flex flex-col gap-3">
              {messages.map((m) => (
                <PressCard
                  key={m.id}
                  m={m}
                  viewer={viewerSide}
                  fresh={m.id === freshMessage}
                  latest={m.kind === "say" ? c.lastPress : m.kind === "deliver" ? c.lastDelivery : null}
                  now={t}
                  status={c.status}
                  stageName={staged ? c.stages[m.stage - 1]?.name : undefined}
                />
              ))}
            </ol>
          )}
          {c.lastUrl && (
            <p className="mt-4 text-[13.5px] text-ink-2">
              Newest finished page: <a className="mono link" href={c.lastUrl} target="_blank" rel="noreferrer">{pageName(c.lastUrl)}</a>
              {c.lastFp && <span className="mono text-ink-3"> · fp {c.lastFp}</span>}
              {draftOfUrl(c.lastUrl) && (
                <>
                  {" "}
                  · <a className="link" href={`/drafts/${draftOfUrl(c.lastUrl)!.file}`} target="_blank" rel="noreferrer">this site&apos;s copy</a>
                </>
              )}
            </p>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          {c.status === "active" && party && (
            <WalletGate what="to write in this thread">
              <Composer
                role={party}
                holder={c.holder}
                deliveries={c.deliveries}
                brief={c.brief}
                busy={busy}
                stageLabel={stageLabel}
                deliverWait={deliverWait}
                staged={job?.key === "staged"}
                onSay={(text, press) =>
                  void run({
                    call: calls.say(c.id, text),
                    label: press ? "Press: a message the network judges" : "A note (not a press)",
                    judged: press,
                    sign: signGuide({ fn: "say", label: press ? "Send this message as a press" : "Send this note", feeAtto: c.feeAtto, holder: c.holder, role, mock: isMock }),
                    sending: press
                      ? judgeGuide({ role, commission: c.id, presser: party, feeAtto: c.feeAtto, stage: "busy", mock: isMock })
                      : noteGuide({ role, commission: c.id, sender: party, holder: c.holder, feeAtto: c.feeAtto, mock: isMock }),
                  })
                }
                onDeliver={(url, note) =>
                  void run({
                    call: calls.deliver(c.id, url, note),
                    label: `Delivery: ${pageName(url) || url}`,
                    judged: true,
                    sign: signGuide({ fn: "deliver", label: `Deliver ${pageName(url) || url}`, feeAtto: c.feeAtto, holder: c.holder, role, mock: isMock }),
                    sending: readGuide({ role, commission: c.id, page: pageName(url) || url, feeAtto: c.feeAtto, holder: c.holder, stage: "busy", mock: isMock }),
                  })
                }
                onTake={() =>
                  void run({
                    call: calls.takeMove(c.id),
                    label: "Took the move",
                    judged: false,
                    sign: signGuide({ fn: "take_move", label: "Take the move: your own clock starts", feeAtto: c.feeAtto, holder: c.holder, role, mock: isMock }),
                    sending: sendingGuide({ fn: "take_move", target: c.id, feeAtto: c.feeAtto, holder: c.holder, role, mock: isMock }),
                  })
                }
              />
            </WalletGate>
          )}
          {isDemo && !job && role !== "maker" && (c.status === "requested" || c.status === "active") && <OffScriptNote status={c.status} />}
          {demoJob && c.status === "active" && role !== "maker" && demo && (
            <>
              {demo.online ? (
                <DemoMoves job={job!} holder={c.holder} stage={c.stage} stageName={staged ? cur?.name : ""} busy={busy} drafts={demo.drafts} draftsReason={demo.draftsReason} onAct={onDemoAct} />
              ) : (
                <DemoNote />
              )}
            </>
          )}
          {demoJob && c.status === "requested" && !demo?.online && <DemoNote />}
          {party && me.address && <CreditPanel address={me.address} onCredit={setCredit} />}
          <section aria-labelledby="sent-title">
            <h2 id="sent-title" className="text-[20px]">
              Sent from this browser
            </h2>
            <div className="mt-2">
              <TxList thing={id} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
