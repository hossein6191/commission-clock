# Decisions

Why each rule of `contracts/commission_clock.py` is the way it is, and what is
verified and what is not.

## 1. The clock counts turns, not days

**The seconds that count are the seconds a side held the move.** A deadline in
wall time charges the maker for the client's silence, and a pause button
charges the client for the maker's convenience. A chess clock does neither,
provided somebody neutral decides when the move has changed hands. The
contract stores the holder, when it took the move, and each side's used
seconds, and books a turn only when the move changes hands. Nothing needs to
run in the background, and a view shows enough for anyone to compute the live
use from the chain's clock.

**The terms are copied onto each commission.** A studio's terms are fixed
when it opens, and a commission copies them when it is requested, so what the
client read before paying is what applies, whatever happens to the studio
afterwards.

**The clock starts on acceptance, not on payment.** Nobody can make the maker's
clock run by commissioning it: the maker chooses to accept, and until then the
client can withdraw and the maker can decline, each returning the whole fee.
So there is no capacity cap that a stranger could fill.

**A request waits seven days, not forever.** Without a window a maker could
accept a request the client stopped watching months ago, ask one question, and
collect the kill fee once the client's short allowance ran out. After seven
days `accept` refuses; the client withdraws or the maker declines, and either
way the whole fee goes back.

**A turn handed over by the network starts with 300 uncharged seconds.** A
transaction is stamped with the time it was sent, and a press or a delivery
takes a consensus round (four model calls on every node, a fetch, sometimes a
new leader) before the side receiving the move can see it holds it. Charging
that round to the receiver would let a studio set a 300-second allowance that
two rounds use up. So a turn handed over by a judged message or a delivery is
charged only after `TURN_GRACE` = 300 seconds, a delay of the kind chess clocks
use for the same reason. A turn a side takes itself, and the maker's first turn
at acceptance, are charged from the side's own transaction: it chose the
moment, and a free start there would let a maker reset its clock with a pass
and a take. A stage the client accepts hands the next turn to the maker with
the same grace: the client chose the moment, not the maker.

**A turn never moves back.** Each transaction carries its own clock, and one
can read earlier than the turn it ends. Handing the move over then keeps the
turn's start where it was rather than moving it back, which would count the
overlap twice: once in the old holder's turn and again in the new one's.

## 2. A press is judged as two framings, both orders, inside one block

**The network is asked what a message does, never who should be paid.** HAND
asks whether the holder is now waiting for something only the other side can
give. CARRY asks whether the holder can still carry on. Both are questions
about the message in the light of the brief and the thread. The contract
alone decides what a pass means for the clock and the money, and the model
never sees an amount, an address or a time.

**The mirror framing catches agreement with everything.** A pass needs HAND
yes and CARRY no. A model that answers yes to both lands on `unclear`, and so
does one that answers no to both.

**Both orders, because position bias is invisible to consensus.** Every
validator builds the same prompt and would lean the same way. Asking with the
thread first and with the new message first, inside the same block, is the
only place that lean shows. When the orders disagree the stored value is
`unclear`. The comparison stays exact and nothing is forgiven in it.

**The rules are in the prompt, word for word, and published.** A question the
brief already answers does not hand the move over; thanks, praise, promises
and progress updates do not; "I'll get back to you" keeps it; concrete
answers, material and specific revisions do. These are the cases a party would
try to game, and they are spelled out so every validator applies the same
standard. `rules()` returns them, and the test suite pins them.

**The question being answered is always in the thread.** A press is judged
with the last six messages, and the side without the move can post as many
notes as it likes, none of which costs it anything. Without a pin, six notes
push the question out of the window and a bare "Sea-green, please." is judged
without the question it answers. The message that handed the holder the move
is stored on the commission, and when it is older than the window it comes
first in the thread, followed by a line saying messages were left out.

**Only the holder's messages are judged.** A message from the other side
cannot move the clock in anyone's favour, so asking about it would cost a
round and decide nothing. It is recorded as `noted` and appears in the thread
for later presses. A side that wants to answer while the other holds the move
takes the move first, which only ever costs itself.

**Unclear leaves the move where it was.** The holder can rephrase. The other
side can take the move if it wants to go on. Neither gains time from a split
network.

## 3. A delivery is a page every validator reads

**The maker gives an address, never a file and never a word like "done".**
Saying the work is finished is a message the rules say keeps the move. A
delivery is a page on the live web that every validator fetches itself, and
what moves the clock is what the page holds.

**The fingerprint is part of the agreed value.** Each validator fingerprints
the text it read, after collapsing whitespace and keeping the first 8,000
characters, and the fingerprint is compared with the leader's exactly. A page
that differs between fetches gets no consensus, and nothing is stored. The
stored fingerprint lets the client check later that the page it is reviewing
is the page that was judged.

**8,000 characters, then cut.** A description, an article or a short piece of
code fits. Collapsing whitespace first means a page served with different line
endings or indentation reads the same everywhere. Only the first 32,000
characters are collapsed, so the work every node does is bounded by a constant
and never by the page the maker chose. The cut is stated as a limit; a longer
piece needs a page whose start shows that it is complete.

**An error page is a failed read.** Reading a page as text returns an error
page's text with no status, so a 404 for a commit not pushed yet would read the
same for every node, agree, and be stored as a missing delivery on the thread
and the studio's public record. Every node reads the page's status first, and
an answer of 400 or above raises `[TRANSIENT]` before any model is asked.

**A delivery that is not there changes nothing.** `missing` and `unclear` are
recorded in the thread and on the studio's record, and the move stays with the
maker. A delivery that is there gives the move to the client, who now owes a
review, but only if the maker held the move. A maker cannot take the move from
a client that already holds it by delivering.

## 4. A failure is never a verdict

**A failed fetch or a failed model call stores nothing.** The leader raises
`[TRANSIENT]` or `[LLM_ERROR]`, validators never agree with a raised leader,
and the call can be made again. A page that answers with an error status is a
failed fetch too. A validator whose own fetch or model call fails
disagrees rather than escaping. A page that reads as nothing is a failed
read, not an empty page judged missing.

**Nothing is written before a round.** `say` and `deliver` check the party,
the state, the text, the address and the clock first, and only then start the
round. A round that does not settle leaves no trace. A static test reads both
methods to hold them to that.

## 5. The money is already there, and leaves through one door

**The fee is held from the request.** Every settlement pays out exactly the
held fee, or on a staged commission the unpaid remainder: the maker gets what
it is owed and the client gets the rest. Nothing is left behind and nothing is
paid twice. `_pay`, called only by `_settle` and by a stage payment, is the
only place that sends money from a commission; `withdraw` is the only place
that sends credit, and only to its owner. The static test lists every transfer
in the contract.

**The cut is per started step and capped.** A minute over is a step, so
"I was only a few seconds late" is not a way round it. The cap is the
studio's choice, at most 90%, and the studio's terms must reach it within
30 days of the allowance running out, so a client is never stuck with a maker
who has gone silent.

**Silence is settled by the side that is waiting.** A client that sits on a
delivery past its own allowance has had its review time; the maker settles as
if it had accepted, cut and all. A client that sits on a question before
anything was delivered leaves the maker a kill fee for the work it could not
finish. A maker that sits on its move until its cut reaches the cap lets the
client cancel. Each needs the other side to have held the move past a published
limit, measured on the chain's clock.

**Never in the same breath.** Both settlements also need the holder's current
turn to have been charged `TURN_NOTICE` = 300 seconds. Without it, a side whose
allowance ran out on an earlier turn could be settled one second after the move
reached it: a maker could deliver and claim silence before the client saw the
delivery, and a client could answer a capped maker and cancel before the maker
could revise. The notice is no longer than the shortest allowance, so it never
outweighs a whole allowance; it only guarantees a turn.

**The kill fee comes out of the same cut.** A flat 25% would pay a maker deep in
its late cut more for walking away than for delivering: at a 90% cut, accepted
work pays 10% and a lapse 25%. The kill fee is `min(25%, 100% - cut)` of the
fee, so a lapse never pays more than accepted work would at the same moment.

**A cancel after a delivery is not a refund.** The client keeps a page the
network agreed was the finished piece. If a maker then sits on a revision
until its cut reaches the cap, the client may still end the commission, but it
settles as `accept_work` would at the cap: the maker gets the fee less the
capped cut. Without a delivery the whole fee goes back.

**The payable door never asks and never keeps.** `request_commission` checks
everything without raising, and every refusal sends the value back in the same
transaction with `{"ok": false}`. It never runs the model.

## 6. Stages: paid as the work arrives, never twice

**Why stages.** One delivery at the end is the whole fee on one judgment. On a
piece that takes weeks, the maker carries all the risk until the last page and
the client has nothing to stop on before it. Named stages with shares of the
fee let the client pay for an outline it has seen, and let the maker be paid
for it, without trusting the other with the rest. The stages are the studio's
own words, fixed when it opens and copied onto each commission at request time,
so the client pays for exactly the stages it read; at most four, so every walk
over them is bounded by a constant.

**Each delivery is judged against its stage.** A finished page is not an
outline, and an outline is not the finished page. The current stage reaches
the prompt in its own `STAGE` block, built from the contract's numbers and the
maker's words, fenced like every other party text. A one-stage studio is asked
exactly what version 1 asked, with no `STAGE` block, so nothing that was
measured on chain for version 1 changes.

**The cut on a stage is taken on that stage's share, at the cut reached when it
is paid.** The formula:

```
share_k   = fee * share_bps_k // 10000        (the last stage takes fee - the others)
cut_bps   = min(max_cut_bps, ceil(max(0, maker live use - maker_seconds) / step_seconds) * cut_bps)
cut_k     = share_k * cut_bps // 10000         (cut_bps as it stands when stage k is accepted)
to maker  = share_k - cut_k;  to client = cut_k
```

The maker's allowance is one budget for the whole commission, so lateness
carries from stage to stage and never resets. But each share is cut once, when
it is paid, and never again: a stage paid on time keeps its whole share even if
the maker is late later. The alternative, recharging earlier shares at the
higher cut out of a later payment, would make a paid stage provisional, which
is the thing stages exist to avoid. On one stage the formula is version 1's
`fee - fee * cut_bps // 10000`.

**Settlements touch the remainder only.** `claim_silence` and `cancel_late`
settle what is still held. A silent client after a stage's delivery pays that
stage as accepted and a kill fee on the stages after it; a silent client
before one pays the kill fee on the remainder; a capped maker's cancel returns
the remainder, less the current stage at the cap if its page stands. Paid
stages are never clawed back. The settlement loop closes at most four stage
rows, so every settlement stays O(1).

## 7. One bonded appeal per verdict

**Why an appeal at all.** A single round can be wrong in a way the parties can
see and the validators could not: a question the thread had already answered
that the window left out, a page the reader skimmed. Version 1's only answer to
a verdict that went against you was to carry on, rephrase or take the move,
which costs seconds but never corrects the record or the move. An appeal gives
the losing side one argued second reading.

**Why it is not "asking until it suits".** Rule 8 forbids a route out that is
the same question asked again until the answer changes. The appeal is built so
it is not: it is available once per verdict, only to the side the verdict went
against, only within 600 seconds, never of an appeal's own verdict, and only
on the latest judged press or delivery. It costs a 0.1 GEN bond that goes to the
other side when the verdict stands, so a side that appeals everything pays the
side it appeals against. And it is not the same question: it adds the
appellant's argument and, for balance, the other side's last message, as
fenced and labelled party argument the prompt tells the reader to weigh only
where the other blocks bear it out. It never tells the reader what the first
answer was. The comparison stays exact, both orders stay inside one block, and
a disagreement still lands on `unclear`; an appeal that does not settle stores
nothing, exactly like a first round.

**The same page, or none.** A delivery appeal reads the page again and judges
it only if it still gives the fingerprint that was judged. A page that changed,
went away or reads as nothing is agreed as `changed` without asking any model,
and that counts against the maker, who controls the page: a delivered verdict
becomes missing, a missing one stands. Otherwise a maker could edit a page
after a verdict and appeal into a different judgment of different bytes.

**What a different verdict changes.** The message keeps both verdicts. The
move goes where the new verdict puts it, but only when nothing moved the clock
or was judged since: otherwise the parties have moved on and rewinding the
move would undo choices made after it, so only the record and the stage's
standing delivery change. When the move does change, the running turn is
charged only up to the verdict, so the seconds the appeal took go to nobody,
and the new holder's turn starts with the usual grace. Money already paid
never moves.

**The other side waits, briefly and only on its own verdicts.** A settlement
could end a commission before the losing side had a chance to appeal, so
`claim_silence` waits while the client may still appeal a verdict on one of
the maker's messages, and `cancel_late` while the maker may appeal one of the
client's. Only the settler's own messages count: a side cannot keep a
settlement away by making new verdicts against itself every nine minutes. The
wait is never more than 600 seconds after the settler's own last judged
message. The maker cannot deliver over a delivered page the client may still
appeal until the client has written since (a revision request, say), so the
client's appeal cannot be overwritten either; taking the move first does not
lift it. A press that may be appealed is replaced only by a later press, and
the side a press verdict favoured can press only after taking the move, which
gives the appellant the move its appeal asked about. `accept_stage` never waits: it
is the client's own call on a verdict in its favour or against it.

**Payable calls never ask.** `deposit` adds credit and refuses only a deposit
of nothing, returning it with `ok: false`; it never runs the model and never
raises. The bond is taken from credit inside the appeal, so the appeal itself
takes no value and can raise its refusals before any round.

## 8. Every party has a way out

| refused | the way out |
|---|---|
| a client sent the wrong amount | send exactly the fee |
| a client found the studio closed | the maker reopens it, or another studio |
| a request the maker never accepts | `withdraw_request` |
| `accept` more than seven days after the request | the client withdraws, or the maker declines |
| a press judged keep or unclear | rephrase it |
| a client wants to answer while the maker holds the move | `take_move`, then `say` |
| a delivery judged missing | deliver the finished page |
| a delivery whose page failed to load or answered an error status | deliver again once it answers |
| `accept_work` before a delivery | the maker delivers |
| `claim_silence` too early, or inside the notice | the refusal says how many seconds are left |
| `cancel_late` too early, or inside the notice | the refusal says how many seconds are left |
| a client that will not answer | `claim_silence`: settled, or the kill fee |
| a maker that will not move | `cancel_late` at the cap |
| `accept_stage` before the stage's delivery | the maker delivers the stage's page |
| an appeal refused for its bond | `deposit`, then appeal |
| an appeal refused for its window, or a lost appeal | the ordinary routes: rephrase, deliver again, take the move |
| `claim_silence` or `cancel_late` waiting on the other side's appeal | the refusal names the deadline; at most 600 s |
| a maker refused a redelivery over an appealable page | after the window, or at once once the client has written |

Each is walked as a journey in `TestRoutesOut`, and the random journeys end by
bringing every commission still running to a close through a party's own call.

## What is verified, and what is not

Verified offline: every rule and refusal above; each verdict and what it does
to the clock; the clock arithmetic across switches, takes and settlement,
including the grace on a handed-over turn and none on a taken one, and a clock
that reads before a turn began without moving the turn back; the notice before
each settlement, including for a side whose allowance ran out on an earlier
turn and for a maker handed a revision past its cap; the accept window at its
boundary; the question being answered staying in the thread after six notes;
every settlement and its exact split, including the per-started-step rounding
at each boundary, the cap, an odd fee, the kill fee net of the cut, and a
cancel after a delivery; stages declared, refused and copied with the odd atto
on the last; each stage cut on its own share at the cut then, never again; the
remainder-only silence claim and cancel; an appeal upheld (bond to the other
side) and overturned (the move, the seconds since given to nobody, the stage's
delivery), the changed page read against the maker, the window at its
boundary, once only, the bond, a failed appeal round storing nothing, an
appeal after the clock moved on changing only the record, and the waits that
protect an appeal without letting the appellant extend them; money, credit,
stage and clock invariants after every step of twenty-four seeded random
journeys that must reach every status, every verdict and every appeal
outcome; a failed fetch, a page that reads as nothing and a failed model call
each storing nothing; an error status (404, 410, 500, 503) storing nothing
while a redirect is read; the raw cut before the spacing is collapsed;
validators whose pages differ disagreeing; whitespace
alone not changing a page; the two orders or the two framings disagreeing
landing on `unclear`; a message from the side without the move never reaching
the network; every demo draft coming to its verdict with a scripted reader;
static rules over the parsed source (sender gates, the payable door, loops,
the prompt boundary, the closures, the comparison, no float, transfers, the
clock's single mover, the appeal's party argument reaching the prompt only as
fenced blocks); and 378 mutants, none surviving.

Not verified offline: how real models on Studio read the demo messages and
drafts, the staged pages and an appeal's argument. The scripted reader in the tests is a stand-in. The on-chain run is the
evidence for that, and its record goes in the README once it has run. The
recorded run is of version 1; version 2's smoke has been checked for syntax
only and has not run on chain.
