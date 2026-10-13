"use client";

// The composer of a commission room, for its two parties while it is active. A message from the side
// that holds the move is a press: one round plunger, "Press: send and hand over the move", and the
// network decides whether it really does. From the other side it is a brass plate: the message is
// noted and the holder's clock keeps running. The maker also delivers a page, read on the live web.
// Every field has its one-click suggestions, each with what the network should make of it.

import * as React from "react";

import { Field } from "@/components/bits";
import { Brass, Plunger } from "@/components/button";
import { Suggest } from "@/components/suggest";
import { draftsCommit, REPO_URL } from "@/lib/config";
import { DRAFTS, draftUrl, repoOf } from "@/lib/demo-studio";
import { MOCK_COMMIT, MOCK_REPO } from "@/lib/chain-mock";
import { isMock } from "@/lib/chain";
import { MAX_NOTE, MAX_TEXT, deliveryProblem, messageProblem, plain, type Holder, type Side } from "@/lib/rules";
import { NOTE_CHIPS, messageChipsFor } from "@/lib/suggestions";

const noopSubscribe = () => () => {};
/** The site's own origin in the browser ("" on the server). */
function useOrigin(): string {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}

/** The pages a maker can deliver with one click: the drafts pinned to a commit, or this site's own copies when it is served over https. */
export function deliveryChips(origin: string): { label: string; value: string }[] {
  const repo = isMock ? MOCK_REPO : repoOf(REPO_URL);
  const commit = isMock ? MOCK_COMMIT : draftsCommit();
  if (repo && commit) return DRAFTS.map((d) => ({ label: `${d.file} (pinned)`, value: draftUrl(repo, commit, d.file) }));
  if (origin.startsWith("https://")) return DRAFTS.map((d) => ({ label: `${d.file} (this site)`, value: `${origin}/drafts/${d.file}` }));
  return [];
}

export function Composer({
  role,
  holder,
  deliveries,
  busy,
  onSay,
  onDeliver,
  onTake,
}: {
  role: Side;
  holder: Holder;
  deliveries: number;
  busy: boolean;
  onSay: (text: string, press: boolean) => void;
  onDeliver: (url: string, note: string) => void;
  onTake: () => void;
}) {
  const [text, setText] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [note, setNote] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [triedDelivery, setTriedDelivery] = React.useState(false);
  const origin = useOrigin();
  const press = holder === role;
  const chips = messageChipsFor(role, holder, deliveries);
  const sent = plain(text);
  const problem = messageProblem(sent);
  const pages = deliveryChips(origin);
  const deliverProblem = deliveryProblem(url.trim(), plain(note));
  const other = role === "maker" ? "client" : "maker";

  return (
    <section aria-labelledby="composer" className="sheet p-4 sm:p-5">
      <p className="kicker text-ink-3">{press ? "Your move" : `The ${holder}'s move`}</p>
      <h2 id="composer" className="mt-0.5 text-[24px]">
        {press ? "Make your move" : "Write while you wait"}
      </h2>
      <p className="mt-1 max-w-[62ch] text-[14px] text-ink-2">
        {press
          ? `You hold the move, so this message is a press: the validators decide whether it really leaves you waiting on the ${other}. Only then does the move, and the clock, go over.`
          : `The ${other} holds the move. A message from you now is noted: nobody is asked, and the ${other}'s clock keeps running.`}
      </p>

      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (problem || busy) return;
          onSay(sent, press);
          setText("");
          setTried(false);
        }}
      >
        <Field id="message" label="Message" count={`${[...sent].length}/${MAX_TEXT}`} error={tried && problem ? problem.charAt(0).toUpperCase() + problem.slice(1) + "." : ""}>
          <textarea id="message" className="field min-h-[84px]" value={text} maxLength={MAX_TEXT + 40} onChange={(e) => setText(e.target.value)} placeholder="One line of plain text" />
        </Field>
        <Suggest
          label="Suggested messages"
          chips={chips.map((c) => ({ label: c.label, value: c.text, tag: c.expect }))}
          onPick={(v) => setText(v)}
          isOn={(v) => v === text}
        />
        {chips.find((c) => c.text === text) && <p className="mt-1.5 text-[12.5px] text-ink-3">The network should agree: {chips.find((c) => c.text === text)!.note}.</p>}
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          {press ? (
            <Plunger type="submit" disabled={busy} label="Press: send and hand over the move" glyph={<span className="mono text-[13px]">GO</span>} />
          ) : (
            <Brass type="submit" disabled={busy}>
              Send a note (the {other}&apos;s clock keeps running)
            </Brass>
          )}
          {!press && (
            <Brass variant="plain" disabled={busy} onClick={onTake}>
              Take the move onto yourself
            </Brass>
          )}
        </div>
      </form>

      {role === "maker" && (
        <form
          className="mt-6 border-t border-dashed border-line-strong pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTriedDelivery(true);
            if (deliverProblem || busy) return;
            onDeliver(url.trim(), plain(note));
            setTriedDelivery(false);
          }}
        >
          <h3 className="text-[19px]">Deliver the work</h3>
          <p className="mt-1 max-w-[62ch] text-[14px] text-ink-2">
            Point at the finished piece on a public page. Every validator opens it on the live web and asks whether the finished piece is there; read as delivered, the move goes
            to the client for review.
          </p>
          <div className="mt-3 grid gap-3">
            <Field id="page" label="Page address" error={triedDelivery && deliverProblem ? deliverProblem.charAt(0).toUpperCase() + deliverProblem.slice(1) + "." : ""}>
              <input id="page" className="field mono text-[14px]" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." inputMode="url" autoComplete="off" />
              {pages.length > 0 ? (
                <Suggest label="Pages you can deliver" chips={pages} onPick={setUrl} isOn={(v) => v === url} />
              ) : (
                <p className="mt-1.5 text-[12.5px] text-ink-3">The demo drafts are not pinned to a commit on this site yet; any public https page works.</p>
              )}
            </Field>
            <Field id="note" label="Note (optional)" count={`${[...plain(note)].length}/${MAX_NOTE}`}>
              <input id="note" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
              <Suggest label="Suggested notes" chips={NOTE_CHIPS.map((n) => ({ label: n || "(no note)", value: n }))} onPick={setNote} isOn={(v) => v === note} />
            </Field>
          </div>
          <div className="mt-4">
            <Plunger type="submit" disabled={busy} label="Press: deliver the page" glyph={<span className="mono text-[12px]">PAGE</span>} />
          </div>
        </form>
      )}
    </section>
  );
}
