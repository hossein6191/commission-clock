// Whole commissions through the in-memory contract of mock mode, from node, with no browser:
//
//   node --test tests/unit/mock-flow.test.mjs
//
// A visitor commissions the demo studio and plays the client while the demo maker makes every move in
// its script: a sham question and a promise keep the move, three wrong pages are read as missing, a
// real question passes it, the client's answers pass it back or keep it, the finished page and the
// revised one are read as delivered, and the client accepts; the same for each of the four demo jobs,
// and nothing at all from the demo maker on any other brief. Then every way a commission settles
// (accepted on time and late, by silence, lapsed, cancelled late with and without a delivery,
// withdrawn, declined), each first refused while it is not yet open and told how long, and every
// refusal a party can meet, with its way out. After every step no atto is created or lost and the
// contract holds exactly the fees of the commissions requested or active.

import test from "node:test";
import assert from "node:assert/strict";

import * as mock from "../../lib/chain-mock.ts";
import { calls } from "../../lib/calls.ts";
import { DEMO_BRIEF, DEMO_JOBS, DEMO_TERMS, DRAFTS, LATER, draftOf, jobOf, offScript } from "../../lib/demo-studio.ts";
import { JOB_CHIPS } from "../../lib/suggestions.ts";
import { capAfter } from "../../lib/clock.ts";

const { VISITOR, DEMO_MAKER, MY_MAKER, PASSER_BY } = mock;
const FEE = DEMO_TERMS.feeAtto;

async function world() {
  let sum = mock.mockContractBalance();
  for (const a of mock.ACCOUNTS) sum += await mock.balanceOf(a);
  return sum;
}

const view = async (fn, args) => JSON.parse(await mock.view(fn, args));

/** Nothing created or lost; the contract holds exactly the fees of the commissions requested or active. */
async function conserved(total, step) {
  const { held, balance } = mock.mockHeld();
  assert.equal(held, balance, `${step}: the contract's balance is every fee it holds`);
  assert.equal(await world(), total, `${step}: no atto created or lost`);
  const stats = await view("stats", []);
  let open = 0n;
  for (let k = 1; k <= stats.commissions; k++) {
    const c = await view("commission", ["C" + k]);
    const live = c.status === "requested" || c.status === "active";
    assert.equal(BigInt(c.held), live ? BigInt(c.fee) : 0n, `${step}: C${k} holds its fee only while it is open`);
    if (!live) assert.equal(BigInt(c.maker_paid) + BigInt(c.client_paid), BigInt(c.fee), `${step}: C${k} paid out its whole fee`);
    open += BigInt(c.held);
  }
  assert.equal(BigInt(stats.held), open, `${step}: stats().held is every open fee`);
  assert.equal(BigInt(stats.held), BigInt(stats.taken) - BigInt(stats.to_makers) - BigInt(stats.to_clients), `${step}: held = taken - paid out`);
}

async function finalOf(hash) {
  for (let i = 0; i < 40; i++) {
    const s = await mock.txStatus(hash);
    if (s.status === "FINALIZED" || s.status === "UNDETERMINED") return s;
  }
  throw new Error("never final: " + hash);
}

async function send(as, call) {
  mock.setMockPersona(as);
  return finalOf(await mock.write(call));
}

async function demo(cid, action) {
  const a = action === "accept" ? await mock.demoAccept(cid) : await mock.demoAct(cid, action);
  assert.equal(a.ok, true, `the demo maker did ${action}: ${a.reason ?? ""}`);
  return finalOf(a.hash);
}

const refusal = (s) => (s.exec === "ERROR" ? s.message : s.result?.ok === false ? s.result.reason : "");

async function commissionDemo(brief = DEMO_BRIEF) {
  const r = await send(VISITOR, calls.requestCommission("S1", brief, FEE));
  assert.equal(r.result.ok, true, "commissioned");
  return r.result.commission;
}

test("the demo maker's whole script, and the verdict each move earns", async () => {
  await mock.faucet(VISITOR);
  const total = await world();
  await conserved(total, "seeded");
  const before = await mock.balanceOf(VISITOR);
  const cid = await commissionDemo();
  assert.equal(await mock.balanceOf(VISITOR), before - FEE, "the fee left the client");
  let c = await view("commission", [cid]);
  assert.equal(c.status, "requested");
  assert.equal(c.held, FEE.toString(), "the contract holds it, not the maker");
  await conserved(total, "requested");

  await demo(cid, "accept");
  c = await view("commission", [cid]);
  assert.equal(c.status, "active");
  assert.equal(c.holder, "maker", "the clock starts with the move on the maker");
  assert.equal(c.grace, 0, "the maker's first turn has no grace");

  const verdicts = [];
  const expectStep = async (s, verdict, holder, step) => {
    assert.equal(s.result?.verdict, verdict, `${step}: ${refusal(s)}`);
    assert.equal(s.result.holder, holder, `${step}: the move is the ${holder}'s`);
    verdicts.push(verdict);
    await conserved(total, step);
  };

  await expectStep(await demo(cid, "sham"), "keep", "maker", "the sham question");
  await expectStep(await demo(cid, "update"), "keep", "maker", "the promise");
  await expectStep(await send(VISITOR, calls.say(cid, "Thank you for taking this on. The mug goes in our autumn listing.")), "noted", "maker", "the client writes off its turn");
  for (const page of ["placeholder", "outline", "wrong"]) await expectStep(await demo(cid, page), "missing", "maker", `the ${page} page`);
  c = await view("commission", [cid]);
  assert.equal(c.deliveries, 0, "nothing delivered yet");
  const q = await demo(cid, "question");
  await expectStep(q, "pass", "client", "the real question");
  c = await view("commission", [cid]);
  assert.equal(c.handed_by, Number(q.result.message.split("#")[1]), "the question handed the move over");
  assert.equal(c.grace, 300, "and the client's turn has its grace");
  await expectStep(await send(VISITOR, calls.say(cid, "I'll get back to you on that.")), "keep", "client", "a promise from the client");
  await expectStep(await send(VISITOR, calls.say(cid, "Can you make it pop a bit more?")), "unclear", "client", "a vague line");
  await expectStep(await send(VISITOR, calls.say(cid, "Sea-green, please.")), "pass", "maker", "the answer");
  await expectStep(await demo(cid, "final"), "delivered", "client", "the finished page");
  c = await view("commission", [cid]);
  assert.equal(c.deliveries, 1);
  assert.equal(c.last_fp, draftOf("final", "mug").fp, "the fingerprint of the finished page is recorded");
  await expectStep(await demo(cid, "question"), "noted", "client", "the maker writes off its turn");
  await expectStep(await send(VISITOR, calls.say(cid, "Please add one line saying it can be gift wrapped at checkout.")), "pass", "maker", "a specific revision");
  await expectStep(await demo(cid, "revised"), "delivered", "client", "the revised page");
  assert.deepEqual([...new Set(verdicts)].sort(), ["delivered", "keep", "missing", "noted", "pass", "unclear"]);

  const thread = await view("messages_of", [cid, 0, 20]);
  assert.equal(thread.total, 14);
  assert.ok(thread.rows.every((m, i) => m.n === i + 1), "the thread is numbered from 1, oldest first");

  const makerBefore = await mock.balanceOf(DEMO_MAKER);
  const done = await send(VISITOR, calls.acceptWork(cid));
  assert.equal(done.result.status, "accepted");
  assert.equal(BigInt(done.result.to_maker) + BigInt(done.result.to_client), FEE);
  assert.equal(await mock.balanceOf(DEMO_MAKER), makerBefore + BigInt(done.result.to_maker), "the maker was paid in the same transaction");
  await conserved(total, "accepted");
});

for (const key of ["bakery", "cafe", "bike"]) {
  test(`the ${key} job: the demo maker's whole script on its brief, and the verdict each move and each suggested reply earns`, async () => {
    const job = jobOf(key);
    const chips = JOB_CHIPS[key];
    await mock.faucet(VISITOR);
    const total = await world();
    const cid = await commissionDemo(job.brief);
    await demo(cid, "accept");
    const verdicts = [];
    const expectStep = async (s, verdict, holder, step) => {
      assert.equal(s.result?.verdict, verdict, `${key}, ${step}: ${refusal(s)}`);
      assert.equal(s.result.holder, holder, `${key}, ${step}: the move is the ${holder}'s`);
      verdicts.push(verdict);
      await conserved(total, `${key}, ${step}`);
    };
    await expectStep(await demo(cid, "sham"), "keep", "maker", "the sham question");
    await expectStep(await demo(cid, "update"), "keep", "maker", "the progress update");
    await expectStep(await send(VISITOR, calls.say(cid, chips.notes[0].text)), "noted", "maker", "the client writes off its turn");
    for (const page of ["placeholder", "outline", "wrong"]) await expectStep(await demo(cid, page), "missing", "maker", `the ${page} page`);
    await expectStep(await demo(cid, "question"), "pass", "client", "the real question");
    await expectStep(await send(VISITOR, calls.say(cid, LATER)), "keep", "client", "a promise from the client");
    await expectStep(await send(VISITOR, calls.say(cid, chips.reviews[2].text)), "unclear", "client", "a vague line");
    await expectStep(await send(VISITOR, calls.say(cid, chips.answers[0].text)), "pass", "maker", "the concrete answer");
    await expectStep(await demo(cid, "final"), "delivered", "client", "the finished page");
    let c = await view("commission", [cid]);
    assert.equal(c.last_fp, draftOf("final", key).fp, "the fingerprint of the job's finished page is recorded");
    assert.ok(c.last_url.endsWith(`/drafts/${draftOf("final", key).file}`));
    await expectStep(await send(VISITOR, calls.say(cid, chips.reviews[1].text)), "keep", "client", "praise");
    await expectStep(await send(VISITOR, calls.say(cid, chips.reviews[0].text)), "pass", "maker", "a specific revision");
    await expectStep(await demo(cid, "revised"), "delivered", "client", "the revised page");
    c = await view("commission", [cid]);
    assert.equal(c.last_fp, draftOf("revised", key).fp);
    assert.deepEqual([...new Set(verdicts)].sort(), ["delivered", "keep", "missing", "noted", "pass", "unclear"]);
    const thread = await view("messages_of", [cid, 0, 20]);
    assert.deepEqual(
      thread.rows.filter((m) => m.role === "maker" && m.kind === "say").map((m) => m.text),
      [job.actions[1].text, job.actions[2].text, job.actions[0].text],
      "every word the maker wrote is its job's own script",
    );
    const done = await send(VISITOR, calls.acceptWork(cid));
    assert.equal(done.result.status, "accepted");
    await conserved(total, `${key} accepted`);
  });
}

test("on any other brief the demo maker neither accepts nor moves, and says why; a page of another job reads as missing", async () => {
  await mock.faucet(VISITOR);
  const total = await world();
  const other = "Wording for a wedding invitation: two names, a date in June, a garden venue, and an RSVP line. Warm, not formal.";
  const cid = await commissionDemo(other);
  assert.equal((await mock.demoAccept(cid)).reason, offScript(cid, true));
  for (const k of ["question", "final"]) assert.equal((await mock.demoAct(cid, k)).reason, offScript(cid, false));
  assert.equal((await view("commission", [cid])).status, "requested", "nothing was signed");
  // Near a demo brief is not one: word for word.
  const near = await commissionDemo(jobOf("bakery").brief.replace("Friendly", "Warm"));
  assert.equal((await mock.demoAccept(near)).reason, offScript(near, true));
  // The client's way out is the whole fee back.
  assert.equal((await send(VISITOR, calls.withdrawRequest(cid))).result.status, "withdrawn");
  assert.equal((await send(VISITOR, calls.withdrawRequest(near))).result.status, "withdrawn");
  await conserved(total, "off-script briefs withdrawn");
  // On a demo job's commission, another job's finished page is about something else: missing.
  const r = await send(VISITOR, calls.requestCommission("S2", jobOf("cafe").brief, 10n ** 18n));
  const c2 = r.result.commission;
  await send(MY_MAKER, calls.accept(c2));
  assert.equal((await send(MY_MAKER, calls.deliver(c2, mock.mockDraft("final", "bakery"), ""))).result.verdict, "missing");
  assert.equal((await send(MY_MAKER, calls.deliver(c2, mock.mockDraft("final", "mug"), ""))).result.verdict, "missing");
  assert.equal((await send(MY_MAKER, calls.deliver(c2, mock.mockDraft("final", "cafe"), ""))).result.verdict, "delivered");
  await conserved(total, "another job's page");
});

test("the demo maker makes one move at a time, only from its script, only on its own studio", async () => {
  const total = await world();
  const cid = await commissionDemo();
  assert.equal((await mock.demoAct(cid, "question")).reason, `${cid} is requested; the demo maker acts only on an active commission`);
  const a = await mock.demoAccept(cid);
  assert.equal(a.ok, true);
  const again = await mock.demoAct(cid, "sham");
  assert.equal(again.ok, false, "the next move waits for the last one to be final");
  assert.match(again.reason, /still waiting for its last move/);
  await finalOf(a.hash);
  assert.equal((await mock.demoAct(cid, "say anything I like")).reason, "the demo maker does only what its buttons say");
  assert.equal((await mock.demoAccept("C4")).reason, "C4 is not a commission of the demo studio; only its own maker acts on it");
  assert.equal((await mock.demoAccept("C999")).reason, "there is no such commission");
  await conserved(total, "demo maker refusals");
  // Withdraw is not open once accepted; the client's way out is the clock.
  const w = await send(VISITOR, calls.withdrawRequest(cid));
  assert.equal(refusal(w), `[EXPECTED] ${cid} is active; a request can be withdrawn only before the maker accepts it`);
});

test("a page that cannot be read stores nothing, and the delivery may be made again", async () => {
  const total = await world();
  mock.setMockPersona(VISITOR);
  const r = await send(VISITOR, calls.requestCommission("S2", DEMO_BRIEF, 10n ** 18n));
  const cid = r.result.commission;
  await send(MY_MAKER, calls.accept(cid));
  const before = await view("commission", [cid]);
  const s = await send(MY_MAKER, calls.deliver(cid, "https://elsewhere.example/page.html", ""));
  assert.equal(s.status, "UNDETERMINED");
  assert.equal(s.undetermined, true);
  assert.match(s.message, /^\[TRANSIENT\] the page could not be fetched/);
  const after = await view("commission", [cid]);
  assert.equal(after.messages, before.messages, "nothing was written");
  const ok = await send(MY_MAKER, calls.deliver(cid, mock.mockDraft("final"), "Here it is."));
  assert.equal(ok.result.verdict, "delivered");
  await conserved(total, "unreadable page");
});

test("every way a commission settles, each refused until it opens and told how long", async () => {
  await mock.faucet(VISITOR);
  await mock.faucet(VISITOR);
  const total = await world();

  // withdrawn: the client takes the request back, all of it.
  let cid = await commissionDemo();
  let before = await mock.balanceOf(VISITOR);
  let s = await send(VISITOR, calls.withdrawRequest(cid));
  assert.equal(s.result.status, "withdrawn");
  assert.equal(await mock.balanceOf(VISITOR), before + FEE);
  await conserved(total, "withdrawn");

  // declined: the maker turns it down, the client gets all of it back.
  const r = await send(VISITOR, calls.requestCommission("S2", DEMO_BRIEF, 10n ** 18n));
  cid = r.result.commission;
  before = await mock.balanceOf(VISITOR);
  assert.match(refusal(await send(PASSER_BY, calls.decline(cid))), /only the maker of C\d+ may decline it/);
  s = await send(MY_MAKER, calls.decline(cid));
  assert.equal(s.result.status, "declined");
  assert.equal(await mock.balanceOf(VISITOR), before + 10n ** 18n);
  await conserved(total, "declined");

  // lapsed: the client sits on a question, nothing delivered; the maker takes a kill fee.
  cid = await commissionDemo();
  await demo(cid, "accept");
  await demo(cid, "question");
  let early = await send(DEMO_MAKER, calls.claimSilence(cid));
  assert.match(refusal(early), /silence can be claimed once it is past them and its current turn has been charged 300 seconds, in \d+ seconds if it does not move/);
  const left = Number(/in (\d+) seconds/.exec(refusal(early))[1]);
  assert.ok(left > DEMO_TERMS.clientSeconds && left <= DEMO_TERMS.clientSeconds + 1 + 300, `the wait (${left} s) is the grace and the allowance`);
  mock.advanceClock(left - 5);
  assert.match(refusal(await send(DEMO_MAKER, calls.claimSilence(cid))), /in [1-9]\d* seconds if it does not move/);
  mock.advanceClock(10);
  s = await send(DEMO_MAKER, calls.claimSilence(cid));
  assert.equal(s.result.status, "lapsed");
  assert.equal(s.result.to_maker, (FEE / 4n).toString(), "the kill fee is a quarter of the fee");
  await conserved(total, "lapsed");

  // accepted by silence: Larkspur Lettering's seeded C5, delivered and never reviewed.
  s = await send(MY_MAKER, calls.claimSilence("C5"));
  assert.equal(s.result.status, "accepted_by_silence");
  assert.equal(s.result.to_maker, (10n ** 18n).toString(), "with a delivery recorded it settles as accepted");
  await conserved(total, "accepted by silence");

  // cancelled late, nothing delivered: the whole fee back once the cut is at its cap.
  cid = await commissionDemo();
  await demo(cid, "accept");
  early = await send(VISITOR, calls.cancelLate(cid));
  assert.match(refusal(early), /the maker's cut on C\d+ is 0 of its 5000 basis point cap; it can be cancelled once the cut is at the cap/);
  const c = await view("commission", [cid]);
  const wait = capAfter({ makerSeconds: c.maker_seconds, cutBps: c.cut_bps, maxCutBps: c.max_cut_bps, stepSeconds: c.step_seconds }) + 1 - c.maker_used;
  mock.advanceClock(wait + 2);
  before = await mock.balanceOf(VISITOR);
  s = await send(VISITOR, calls.cancelLate(cid));
  assert.equal(s.result.status, "cancelled_late");
  assert.equal(s.result.cut_bps, 5000);
  assert.equal(s.result.to_client, FEE.toString());
  assert.equal(await mock.balanceOf(VISITOR), before + FEE);
  await conserved(total, "cancelled late, nothing delivered");

  // cancelled late after a delivery: settled as accepted at the cap.
  cid = await commissionDemo();
  await demo(cid, "accept");
  await demo(cid, "final");
  await send(VISITOR, calls.say(cid, "Please add one line saying it can be gift wrapped at checkout."));
  // a turn just handed over cannot be cancelled in the same breath
  assert.match(refusal(await send(VISITOR, calls.cancelLate(cid))), /it can be cancelled once the cut is at the cap/);
  mock.advanceClock(3 * 3600);
  s = await send(VISITOR, calls.cancelLate(cid));
  assert.equal(s.result.status, "cancelled_late");
  assert.equal(BigInt(s.result.to_maker), FEE / 2n, "the maker keeps the fee less the capped cut");
  await conserved(total, "cancelled late after a delivery");

  // accepted late: the maker went 4 minutes over, two started steps of 10%.
  cid = await commissionDemo();
  await demo(cid, "accept");
  mock.advanceClock(DEMO_TERMS.makerSeconds + 240);
  await demo(cid, "final");
  s = await send(VISITOR, calls.acceptWork(cid));
  assert.equal(s.result.status, "accepted");
  assert.ok(s.result.maker_late >= 240 && s.result.maker_late < 360, `late ${s.result.maker_late} s`);
  assert.equal(s.result.cut_bps, s.result.maker_late > 240 ? 3000 : 2000);
  assert.equal(BigInt(s.result.to_client), (FEE * BigInt(s.result.cut_bps)) / 10000n);
  await conserved(total, "accepted late");

  const record = (await view("studio", ["S1"])).record;
  assert.ok(record.late >= 1 && record.on_time >= 1 && record.lapsed >= 1 && record.cancelled_late >= 2 && record.withdrawn >= 1);
});

test("every refusal a party can meet leaves it a way out", async () => {
  await mock.faucet(VISITOR);
  const total = await world();
  // The maker may not commission its own studio: refused, and the fee comes back in the same transaction.
  const own = await send(DEMO_MAKER, calls.requestCommission("S1", DEMO_BRIEF, FEE));
  assert.equal(own.result.ok, false);
  assert.equal(own.result.reason, "the maker of S1 may not commission its own studio");
  assert.equal(own.result.returned, FEE.toString());
  // The wrong fee, a short brief, a closed studio: each sent back whole.
  const wrong = await send(VISITOR, calls.requestCommission("S1", DEMO_BRIEF, FEE + 1n));
  assert.equal(wrong.result.reason, `send exactly the fee of ${FEE} atto to commission S1; this one sent ${FEE + 1n}`);
  const short = await send(VISITOR, calls.requestCommission("S1", "A mug.", FEE));
  assert.equal(short.result.reason, "the brief is 40 to 800 characters; this one is 6");
  assert.equal(short.result.returned, FEE.toString());
  await send(MY_MAKER, calls.closeStudio("S2"));
  const closed = await send(VISITOR, calls.requestCommission("S2", DEMO_BRIEF, 10n ** 18n));
  assert.equal(closed.result.reason, "S2 is closed to new commissions");
  assert.equal(refusal(await send(MY_MAKER, calls.closeStudio("S2"))), "[EXPECTED] S2 is already closed to new commissions");
  assert.equal((await send(MY_MAKER, calls.reopenStudio("S2"))).result.accepting, true, "and it reopens");
  await conserved(total, "refused requests");

  const cid = await commissionDemo();
  assert.equal(refusal(await send(PASSER_BY, calls.say(cid, "hello"))), `[EXPECTED] only the maker or the client of ${cid} may write in its thread`);
  assert.equal(refusal(await send(VISITOR, calls.say(cid, "hello"))), `[EXPECTED] ${cid} is requested; messages are taken while it is active`);
  // A request the maker sat on past seven days can no longer be accepted; the client withdraws it.
  mock.advanceClock(7 * 86400 + 60);
  const late = await mock.demoAccept(cid);
  const lateTx = await finalOf(late.hash);
  assert.match(refusal(lateTx), /was requested \d+ seconds ago; a request can be accepted within 604800 seconds, and after that only withdrawn by the client or declined by the maker/);
  assert.equal((await send(VISITOR, calls.withdrawRequest(cid))).result.status, "withdrawn");

  const c2 = await commissionDemo();
  await demo(c2, "accept");
  assert.equal(refusal(await send(VISITOR, calls.acceptWork(c2))), `[EXPECTED] nothing has been delivered on ${c2} yet; the maker delivers with a page first`);
  assert.equal(refusal(await send(DEMO_MAKER, calls.takeMove(c2))), `[EXPECTED] the maker already holds the move on ${c2}`);
  assert.equal(refusal(await send(VISITOR, calls.claimSilence(c2))), `[EXPECTED] only the maker of ${c2} may claim the client's silence`);
  assert.equal(refusal(await send(DEMO_MAKER, calls.claimSilence(c2))), `[EXPECTED] the maker holds the move on ${c2}; silence is claimed only while the client holds it`);
  assert.equal(refusal(await send(VISITOR, calls.deliver(c2, mock.mockDraft("final"), ""))), `[EXPECTED] only the maker of ${c2} may deliver on it`);
  assert.equal(refusal(await send(DEMO_MAKER, calls.deliver(c2, "http://x.example/a", ""))), "[EXPECTED] the page address starts with https://");
  assert.equal(refusal(await send(VISITOR, calls.say(c2, "two\nlines"))), "[EXPECTED] a message is printable ASCII on one line");
  // The client takes the move itself: it costs only its own seconds, and gets no grace.
  const take = await send(VISITOR, calls.takeMove(c2));
  assert.equal(take.result.holder, "client");
  const row = await view("commission", [c2]);
  assert.equal(row.grace, 0);
  const thread = await view("messages_of", [c2, 0, 20]);
  assert.equal(thread.rows.at(-1).verdict, "taken");
  assert.equal(refusal(await send(VISITOR, calls.cancelLate(c2))), `[EXPECTED] the client holds the move on ${c2}; it can be cancelled only while the maker holds it`);
  await conserved(total, "refusals");
});

test("the demo drafts are five per job the demo maker can deliver, each read as the demo expects", () => {
  for (const j of DEMO_JOBS)
    assert.deepEqual(
      j.drafts.map((d) => [d.key, d.expect]),
      [
        ["placeholder", "missing"],
        ["outline", "missing"],
        ["wrong", "missing"],
        ["final", "delivered"],
        ["revised", "delivered"],
      ],
      j.key,
    );
  assert.equal(DRAFTS.length, 20);
});
