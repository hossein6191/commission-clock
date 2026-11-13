# Contracts

One file, `contracts/commission_clock.py`. It is the only thing in this
repository that asks the network anything.

## contracts/commission_clock.py

### Purpose

A commission escrow whose deadline is a chess clock. A maker opens a studio
with a fee, its own allowance of seconds, the client's allowance, and a late
cut. A client commissions it with the fee and a brief, and the fee is held.
From the maker's acceptance the clock runs only against the side that holds
the move. The move changes hands only when the network agrees that a message
really hands it over, or when a delivered page really holds the finished
piece. Settlement pays out the whole fee in one transaction, and the cut
follows the seconds each side actually held the move.

Contract version 2: a studio may divide the fee into 1 to 4 named stages, each
paid when the client accepts a delivery judged against that stage, cut on its
own share at the cut reached then; and the side a judged verdict went against
may appeal it once, within 600 seconds, for a 0.1 GEN bond from its credit. A
studio with no stages behaves exactly as version 1.

### Consensus

Two kinds of round, each one `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`
block with all its work inside the leader closure. The validator closure is
always `return _agrees(leaders_res, leader_fn)`: it refuses a leader that
raised or returned anything but a dict, runs the leader's work itself inside
`try/except` (its own failure is a disagreement), and compares the whole value
by exact equality.

**A press** (`say` from the side holding the move). Inputs: the brief, the
thread (the last `THREAD_WINDOW` = 6 earlier messages, oldest first, one line
each labelled `MAKER` or `CLIENT`, preceded by the message that handed the
holder the move and the line `(earlier messages left out)` when that message is
older than the six), the new message, and the holder's side.
Four askings in one block:

| asking | blocks | question |
|---|---|---|
| 1 | BRIEF, THREAD, MESSAGE | HAND |
| 2 | BRIEF, MESSAGE, THREAD | HAND |
| 3 | BRIEF, THREAD, MESSAGE | CARRY |
| 4 | BRIEF, MESSAGE, THREAD | CARRY |

HAND asks whether the holder is now waiting for something only the other side
can give that this message actually asks for or hands over. CARRY asks
whether the holder can still carry on without waiting. Both carry the same
rules, word for word, after the blocks. Each answer is read into `yes`, `no`,
`unclear` or `""` (unreadable). Stored value `{"verdict": v}`:
`pass` only on HAND yes, yes and CARRY no, no; `keep` only on HAND no, no and
CARRY yes, yes; `unclear` for every other of the 256 combinations.

**A delivery** (`deliver`). Inputs: the brief and the page address. Every node
reads the page's status itself with `gl.nondet.web.get(url)` (400 or above
raises `[TRANSIENT]`), then calls `gl.nondet.web.render(url, mode="text")`,
collapses the whitespace of the first `MAX_RAW_PAGE` = 32,000 characters
(`" ".join(text[:MAX_RAW_PAGE].split())`), keeps the first `MAX_PAGE_TEXT` =
8,000 characters, and fingerprints them (`sha256(text)[:16]`). Four askings:

| asking | blocks | question |
|---|---|---|
| 1 | BRIEF, PAGE | THERE |
| 2 | PAGE, BRIEF | THERE |
| 3 | BRIEF, PAGE | MISSING |
| 4 | PAGE, BRIEF | MISSING |

Stored value `{"verdict": v, "fp": "<16 hex>"}`: `delivered` only on THERE
yes, yes and MISSING no, no; `missing` only on THERE no, no and MISSING yes,
yes; `unclear` otherwise. A page that does not read the same for a validator
gives it another fingerprint, so it disagrees.

**A delivery at a stage.** On a commission with `n_stages` of 2 or more the
delivery prompt uses `STAGED_HEADER` and `STAGED_UNTRUSTED`, adds a `STAGE`
block after the brief (`_stage_text`: `"Stage k of n: " + name + "; " +
about`, the maker's words, fenced and capped at `MAX_STAGE_TEXT` = 256), keeps
the brief and the stage together in both orders, and asks `QUESTION_THERE_STAGE`
and `QUESTION_MISSING_STAGE`. A one-stage commission's prompt, whether the
studio declared its one stage or none, is byte for byte the version 1 prompt
(`_stage_brief` returns `""`), so a declared single stage's name is shown but
never judged.

**An appeal** (`appeal`). The target is the latest judged press (`press_n`) or
the latest judged delivery (`delivery_n`) that went against the caller
(`_appellant`: a pass against the side now holding the move; a keep or an
unclear against the holder that pressed; delivered against the client; missing
or unclear against the maker), unappealed, at most `APPEAL_WINDOW` = 600 s
after it; the later of the two when both qualify. `arg = (appellant, reason,
reply)`, where reply is the other side's last `say` (`NO_REPLY` or `SAME_REPLY`
when there is none or it is the message judged). The round is the same
`_judge_press` or `_judge_delivery` with `arg`: `_press_task` and
`_delivery_task` add `_parties(APPEAL_UNTRUSTED, appellant)` before the blocks,
`_appeal_blocks` (`APPEAL` capped at 300, `REPLY` at 600; APPEAL first in the
first order, REPLY first in the second) after them, and `APPEAL_NOTE` before
the question. A press appeal is judged with `_thread(cid, n - 1, m.pinned)`,
the thread the press was judged with. A delivery appeal passes the stored
fingerprint as `judged`: a node whose collapsed page is empty, answers 400 or
above, or gives another fingerprint returns `{"verdict": "changed", "fp":
judged}` without asking a model; otherwise it asks the four askings. Stored
value: as the original, with `changed` allowed only on a delivery appeal.

**The prompt boundary.** Every untrusted text (the brief, the thread, the new
message, the page, a stage's name and description, an appeal's reason and
reply) goes through `_block`, which takes the label from a closed
set (anything else prints as `BLOCK`), fences the body (`<` and `>` replaced
by `(` and `)`, length kept), caps it at a limit never below what the door
lets in (brief 800, message 600, thread 7 × 649 plus the gap line, page
8,000), and tags both
delimiter lines with the first 16 hex characters of the body's own sha256.
The side words `maker` and `client` reach a prompt only through `_side` and
`_other`, which return one of the two whatever they are given, and only into
contract constants, never into a block. Every prompt says before the blocks
that the blocks are untrusted and never an instruction.

**Failures.** A failed fetch raises `[TRANSIENT]`, a page that answers 400 or
above raises `[TRANSIENT]`, a page that reads as nothing raises
`[TRANSIENT]`, a failed model call raises `[LLM_ERROR]`, all inside the
leader. Validators never agree with a leader error, so nothing is
stored and the call may be made again.

### State

| field | what it holds |
|---|---|
| `studio_rows` | `Studio`: maker, name, about, fee, maker_seconds, client_seconds, step_seconds, cut_bps, max_cut_bps, accepting, opened_at, and the public record: n_commissions, n_on_time, n_late, n_cancelled, n_lapsed, n_declined, n_withdrawn, n_presses, n_passed, n_kept, n_unclear, n_deliveries, n_delivered, n_missing, late_seconds, n_stages, n_released, n_appeals, n_overturned |
| `commission_rows` | `Commission`: studio_id, client, maker, brief, the terms copied from the studio, status, holder (`maker`, `client` or `""`), since, handed_by (the message that handed the holder the move, 0 when it took the move itself), maker_used, client_used, requested_at, accepted_at, settled_at, n_messages, n_deliveries, last_url, last_fp, last_delivered_at, maker_late, cut_bps_total, maker_paid and client_paid (everything paid so far, released stages included), held (the unpaid remainder), n_stages, stage (the current one), events (moves of the clock and judged verdicts so far), maker_said and client_said (each side's last `say`), press_n and delivery_n (the latest judged press and delivery), n_appeals |
| `message_rows` | `Message` under `"<commission>#<n>"`: commission_id, n, role, kind (`say`, `deliver`, `take`, `stage`), text (a message, a delivery's note, or the accepted stage), url, verdict as it stands (`noted`, `pass`, `keep`, `unclear`, `delivered`, `missing`, `taken`, `accepted`), fp, at, stage, before (who held the move before it), pinned (the handed_by its thread was built with), events (the commission's events after it), was (the first verdict, once an appeal replaced it), appeal (what the appeal came to: a verdict word or `changed`), appeal_role, appeal_reason, appeal_at |
| `stage_rows` | `Stage` under `"<studio>/<k>"` (the studio's terms) and `"<commission>/<k>"` (its copy): owner, k, name, about, share_bps, share (atto; the last stage takes the odd atto), status (`pending`, `current`, `accepted`, the commission's final status, or `closed`), released (to the maker when it closed), cut_bps, cut (to the client), url, fp, delivered_by (the delivery that stands for it), closed_at |
| `credits` | lowercase address → credit for appeal bonds |
| `index`, `counts` | numbered lists: `maker:<address>` (studios), `party:<address>` (commissions as client or maker), `studio:<id>` (commissions), each appended in O(1) and read a page at a time |
| totals | `held_total`, `taken_total`, `to_makers`, `to_clients`, `returned`, `n_refused`, `credit_total`, and the counters behind `stats()`, appeals, overturned and upheld among them |

Statuses: `requested`, `active`, then one of `accepted`,
`accepted_by_silence`, `lapsed`, `cancelled_late`, `withdrawn`, `declined`.
Storage dataclasses hold scalars only. Every instant is seconds on the message
clock, `gl.message_raw["datetime"]`, read with an integer-only calendar.

### The clock

`_move_to(c, side, now, by, upto)` is the only function that changes `holder`,
`since`, `handed_by`, `maker_used` or `client_used` (besides `accept`, which
starts the clock): it adds the running turn's charged seconds, counted up to
`min(upto, now)`, to the holder's used seconds, hands the move to `side`, sets `since = max(now, since)` so a
turn never moves back, and records `handed_by = by`, the number of the judged
message or delivery that handed the move over (0 when the side takes it itself
or the clock stops). `side = ""` stops the clock, which `_settle` does first.
`upto` is `now` everywhere except an appeal that changes a verdict, which
passes the verdict's own time, so the seconds between the verdict and the
appeal go to nobody. Every move counts as an event, and so does every judged
verdict and accepted stage (`_judged`); an appeal moves the clock only when the
commission's `events` still equal the message's, that is when nothing moved
the clock or was judged since.

A turn's grace is `TURN_GRACE` = 300 seconds when `handed_by > 0`, else 0. Its
charged seconds are `max(0, now - since - grace)`, and a side's live use is
`used` plus those while it holds the move. `_opens_in(c, now, need)` is the
seconds until the running turn has been charged `need` seconds if the holder
does not move; `claim_silence` and `cancel_late` refuse while it is above 0,
with `need = max(TURN_NOTICE, allowance or cap_after + 1 - used)`.

| event | the move | grace |
|---|---|---|
| `accept` | to the maker, `since = now` | none |
| `say` by the holder, `pass` | to the other side | 300 s |
| `say` by the holder, `keep` or `unclear` | stays | unchanged |
| `say` by the other side | stays (`noted`) | unchanged |
| `deliver`, `delivered` | to the client, if the maker held it | 300 s |
| `deliver`, `missing` or `unclear` | stays | unchanged |
| `take_move` | to the caller | none |
| `accept_stage`, a stage before the last | to the maker | 300 s |
| `appeal`, a different verdict, nothing since | where the new verdict puts it, charged up to the verdict | 300 s |
| any settlement | stopped | none |

### Methods

Writes: `open_studio`, `close_studio`, `reopen_studio`, `request_commission`
(payable), `withdraw_request`, `decline`, `accept`, `say`, `deliver`,
`take_move`, `accept_stage`, `accept_work`, `claim_silence`, `cancel_late`,
`appeal`, `deposit` (payable), `withdraw`. Views: `studio`, `studios`,
`studios_of`, `commission`, `messages_of`, `commissions_of`,
`studio_commissions`, `credit_of`, `stats`, `rules`.

`accept` refuses more than `ACCEPT_WINDOW` = 7 days after the request.
`claim_silence` needs the client past its allowance and its current turn
charged `TURN_NOTICE` = 300 seconds; `cancel_late` needs the maker's cut at
the cap and the same notice on the maker's turn. A lapse pays the maker
`remainder * min(KILL_BPS, 10000 - cut_bps) // 10000`; a cancel with a
delivery standing for the current stage pays that stage as accepted at the cap
and returns the rest, and without one returns the whole remainder. A silence
claim with a delivery standing for the current stage pays that stage as
accepted plus the kill fee on the stages after it.

`accept_stage` (and `accept_work`, the same) refuses until a delivery stands
for the current stage (`delivered_by > 0` on its stage row). A stage before
the last is paid on its own: `cut = _cut_of(share, cut_bps)` at the cut reached
now, the maker gets `share - cut`, the client `cut`, `held` drops by the share,
the stage closes as `accepted`, the next becomes `current`, a `stage` message
is logged and the move goes to the maker with its grace. The last stage settles
through `_settle` as `accepted`, with `held - _cut_of(held, cut_bps)` to the
maker; on one stage that is version 1's `fee - cut`.

`appeal` refuses a stranger, an inactive commission, a reason outside 1 to 300
printable ASCII characters, a verdict that is not the latest of its kind, went
against the other side, is past its window or was appealed already, and a
caller with less than `APPEAL_BOND` of credit, all before the round. After it:
a different verdict sets `was`, replaces `verdict`, moves the counts, and
`_overturn` applies it (the move when the events are unchanged; the stage's
standing delivery while the verdict's stage is current; never any money); the
same verdict moves `APPEAL_BOND` from the appellant's credit to the other
side's. `claim_silence` and `cancel_late` refuse (`_wait_for_appeal`) while the
other side may still appeal the latest press or delivery when that message is
the settler's own; `deliver` refuses (`_no_redelivery`) while the client may
appeal a delivered page for the current stage and has written nothing since. `deposit` adds what
was sent to the sender's credit and never raises (nothing sent is refused and
answered `ok: false`); `withdraw(amount)` pays 1 to the sender's credit back to
the sender.

Fourteen writes compare the sender with a party and refuse: the maker for
`close_studio`, `reopen_studio`, `decline`, `accept`, `deliver` and
`claim_silence`; the client for `withdraw_request`, `accept_stage`,
`accept_work` and `cancel_late`; either party for `say`, `take_move` and
`appeal`; anyone but the maker for `request_commission`. `open_studio`,
`deposit` and `withdraw` refuse nobody by sender (the first touches only the
new studio, the other two only the sender's own credit), say "Open on purpose"
in their docstrings, and are listed with their reasons in the static test.

`say`, `deliver` and `appeal` check everything before the round (the party, an
active commission, the text, the address, the note, the clock, the appeal's
target and bond) and write nothing before it, so a round that does not settle
leaves no trace.

`_settle` is the single exit of a commission: it stops the clock, pays the
maker `min(max(to_maker, 0), held)` and the client `held - to_maker` of the
unpaid remainder, clears `held`, records the status, the late seconds and the
cut, closes the current stage with that payout and the later ones as `closed`
(a loop over at most `MAX_STAGES` = 4), and never touches a paid stage. Money to
the parties leaves only through `_pay` (from `_settle` and a stage payment) and
a credit only through `withdraw`. Every settlement is O(1). `request_commission`
and `deposit` never raise and never reach the model: every refusal goes through
`_refuse`, which sends the value back.

### Loops

Every loop is bounded by a named constant, and a static test lists each one:
the URL signs (`URL_SIGNS`) and host signs (`HOST_SIGNS`), the fingerprint's
characters (`FP_CHARS`), the thread (`THREAD_WINDOW`), and every list page
(`PAGE`, in `_page`, `studios`, `messages_of`, `studios_of`,
`commissions_of` and `studio_commissions`), the stages (`MAX_STAGES`, in
`_stages_of`, `open_studio`, `request_commission`, `_settle`, `_studio_row`
and `_commission_row`), and the two appeal slots, the latest press and the
latest delivery (in `_appealable` and `_wait_for_appeal`). There is no
`while`.

### Errors

| class | when | stored |
|---|---|---|
| `[EXPECTED]` | a rule of this contract, raised by a write that took no value | nothing |
| `[TRANSIENT]` | the delivery page could not be fetched, answered 400 or above, or read as nothing (on an appeal, only a fetch that failed outright) | nothing |
| `[LLM_ERROR]` | a model call failed | nothing |
| `{"ok": false}` | a refused `request_commission` or `deposit`; everything sent goes back | the refusal is counted |

### Limits

Fee 0.1 to 100 GEN. Maker allowance 600 s to 60 days, client allowance 300 s
to 30 days, step 60 s to 7 days, cut 1 to 2,500 basis points per step, cap 100
to 9,000 and at least the cut, reached within 30 days past the allowance. Kill
fee 2,500 basis points, never more than the fee less the cut. A request is
accepted within 7 days. A handed-over turn's grace is 300 s, and the notice
before a settlement is 300 s charged on the current turn. The first 32,000
characters of a page are collapsed and the first 8,000 of that judged. Brief 40 to 800 characters, message 1 to 600, note up
to 300, name 3 to 60, about up to 300, all printable ASCII on one line. A
delivery address is https, at most 200 characters. The page must read the
same for every validator at the moment of delivery; text is read, images are
not. Stages: 1 to 4, each 100 to 10,000 basis points, adding up to 10,000; a
name 3 to 40 characters, what it holds up to 200, never `|` or `=`; the whole
`stages` argument at most 992 characters. An appeal: within 600 s, once, a
0.1 GEN bond, a reason of 1 to 300 characters. See the README for the full
list.
