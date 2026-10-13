# Commission Clock

A commission escrow with a chess clock: after every message the validators
decide whose move it is now, the clock runs only against that side, and the
late cut comes out of the fee by the seconds each side actually owed.

## The problem

A commission deadline counts wall time. "Delivered in five days" starts when
the client pays and does not stop when the maker asks which colour to use and
waits two days for an answer, or when the client takes a week to review a
draft. The maker is charged for the client's days. Late fees built on that
clock are unfair, so in practice nobody applies them, and the deadline means
nothing.

The obvious fix, a clock that pauses while the maker waits on the client, has
the opposite hole: the maker can stop it whenever it likes. "Quick question,
should this be in English?" stops the clock when the brief already says
English. So does "Any thoughts so far?", and so does "I'm nearly done". Somebody has to decide whether a message
really hands the move to the other side, and whoever the platform pays to
decide is not neutral.

## What it is

A maker **opens a studio** with a fee and the terms of its clock:

- the maker's allowance: its seconds across all its turns (600 s to 60 days);
- the client's allowance: its seconds for answers and reviews (300 s to 30
  days);
- the late cut: `cut_bps` of the fee for every **started** `step_seconds` the
  maker is over its allowance, at most `max_cut_bps`.

A client **commissions** the studio with exactly the fee and a brief. The fee
is held by the contract. Nothing runs yet. The maker **accepts** within seven
days, and the clock starts with the move on the maker. A request the maker has
not accepted by then can only be withdrawn by the client or declined by the
maker, so nobody is started on a request they stopped watching.

From then on the commission is a conversation, and the clock runs only against
the side that holds the move:

- A message from the side that **holds** the move is a press of the clock. The
  network judges whether it really hands the move over: a genuine question,
  real material, concrete revisions. If it does (**pass**), the move goes to
  the other side and the holder's running turn is booked to its seconds. If it
  does not (**keep**), or the network cannot settle it (**unclear**), the move
  stays where it was, and the holder may rephrase.
- A message from the side that does **not** hold the move is recorded as
  **noted**. Nobody is asked anything and the clock does not change.
- The maker **delivers** by giving the address of a page with the finished
  piece. Every validator opens that page on the live web and the network
  agrees whether the finished piece is there. If it is (**delivered**), the
  delivery is recorded with a fingerprint of what the validators read, and the
  move goes to the client, who now owes a review. A placeholder, an outline or
  the wrong piece is **missing**, and nothing changes.
- Either side may **take the move** onto itself at any time. That only ever
  costs the caller its own seconds. It is how a client answers while the maker
  holds the move, and how either side moves on after a judgment went against
  the other.

A turn handed over by a judged message or a delivery is **not charged for its
first 300 seconds**. The transaction that hands the move over is stamped with
the time it was sent, and its round can take minutes to settle, so the side
receiving the move would otherwise pay for a round it could not see. A side
that takes the move itself chose the moment, and is charged from its own
transaction.

The commission ends in one of three ways, each paying out the whole fee in one
transaction:

- **accept_work**: the client accepts once a delivery is recorded. The maker
  gets the fee less the late cut; the client gets the cut.
- **claim_silence**: the client holds the move, its own seconds have run past
  its allowance, and its current turn has been charged 300 seconds. With a
  delivery recorded, the maker settles it exactly as if the client had
  accepted. Without one, the maker keeps a 25% kill fee, never more than the
  fee less its late cut, and the client gets the rest. A late maker never
  earns more by walking away than by delivering.
- **cancel_late**: the maker holds the move, its cut has reached the cap, and
  its current turn has been charged 300 seconds. Without a delivery the client
  gets the whole fee back. With one recorded the client already has the work,
  so it settles as `accept_work` would at the cap.

The 300 seconds of notice mean a side whose allowance ran out on an earlier
turn is never settled against the moment the move reaches it: it always has
time to answer, review or deliver.

Before acceptance the client can **withdraw** its request and the maker can
**decline** it; either way the whole fee goes back to the client.

## How consensus is used

Each judgment is one consensus round. Every validator asks four questions
itself, combines the answers into one word from a closed set, and compares the
value that will be stored with the leader's by exact equality.

### A press

The validators read the brief, the last six earlier messages (oldest first,
one per line, each labelled `MAKER` or `CLIENT`) and the new message. When the
message that handed the holder the move is older than those six, it comes
first, followed by the line `(earlier messages left out)`, so the side without
the move cannot push the question being answered out of sight with a run of
notes. `{holder}`
is the side that holds the move and `{other}` the other side. The contract
puts in the words `maker` and `client` itself. Two framings, each asked in
two orders (the thread then the new message, and the new message then the
thread; the brief always comes first):

> **HAND**: After this new message from the {holder}, is the {holder} now
> waiting for something only the {other} can give (an answer, a decision,
> material, or a review) that this message actually asks for or hands over?
> Answer yes, no or unclear.

> **CARRY**: After this new message from the {holder}, can the {holder} still
> carry on without waiting for the {other}? Answer yes, no or unclear.

Both prompts carry the same rules, word for word:

> Rules: a question the brief or the thread already answers, or one the
> {holder} could reasonably decide alone, does not make them wait; a promise,
> a progress update, thanks or praise does not hand over the move; saying the
> work is done without the work does not hand it over (deliveries go through
> deliver); concrete answers, material or specific revisions do hand it over;
> "I'll get back to you" keeps it.

| HAND, both orders | CARRY, both orders | stored |
|---|---|---|
| yes, yes | no, no | `{"verdict": "pass"}` |
| no, no | yes, yes | `{"verdict": "keep"}` |
| anything else | | `{"verdict": "unclear"}` |

CARRY is the mirror of HAND, so a model that answers yes to everything lands
on `unclear`, never on `pass`. A model that leans on whichever block comes
first answers the two orders differently, and that also lands on `unclear`.
The disagreement is part of the stored value. Nothing is forgiven in the
comparison.

### A delivery

Every validator reads the page's status itself first: an answer of 400 or
above is a failed read, so an error page is never judged as a missing
delivery. Then it fetches the page as text, collapses the whitespace of its
first 32,000 characters to single spaces, keeps the first 8,000, and takes the
first 16 hex characters of their sha256 as the page's fingerprint. Then it asks two
framings about the brief and that text, each with the brief first and with the
page first:

> **THERE**: Does this page contain the finished piece the brief asks for, the
> actual work complete enough for the client to review, rather than a
> placeholder, an outline, a promise, a fragment or something else? Answer
> yes, no or unclear.

> **MISSING**: Is the work the brief asks for missing from this page: the page
> is empty, a placeholder, only an outline or a part, or about something else?
> Answer yes, no or unclear.

| THERE, both orders | MISSING, both orders | stored |
|---|---|---|
| yes, yes | no, no | `{"verdict": "delivered", "fp": "<16 hex>"}` |
| no, no | yes, yes | `{"verdict": "missing", "fp": "<16 hex>"}` |
| anything else | | `{"verdict": "unclear", "fp": "<16 hex>"}` |

The fingerprint is part of the compared value, so a page that does not read
the same for every validator gets no consensus and nothing is stored. The
fingerprint is also what the client can later check the page against.

### What every round shares

- The brief, every message, every note and every fetched page are untrusted.
  Each is fenced (`<` and `>` replaced by `(` and `)`, never deleted), sits
  between delimiter lines tagged with the start of its own sha256, and the
  prompt says before the blocks that they are material and never an
  instruction. Messages are one line each, so a message cannot start a line of
  the thread that claims to be the other side.
- A validator never agrees with a leader that raised. A page that cannot be
  fetched, or answers with an error status, raises `[TRANSIENT]`, and a failed
  model call raises `[LLM_ERROR]`.
  Nothing is written, and the same call can be made again. A validator whose own
  fetch or model call fails disagrees.
- The model never sees an amount, an address, an id or a clock. It sees the
  brief, the messages and the page.
- The clock comes from each transaction's own `datetime`, the same instant on
  every node. No arithmetic in this contract uses a float.

## Why the live web and validator agreement make it a GenLayer job

Both judgments here are about meaning. Does this sentence ask for something
only the other side can give, or does it just sound like a question? Is this
page the finished description, or a placeholder? A deterministic contract
cannot answer either. A platform moderator can, but the moderator works for
somebody, and both sides have money on the answer.

The delivery is a page on the web at the moment of delivery. A contract
cannot fetch it, and an oracle run by either party would be one party reading
it for both. Here every validator fetches the page independently, reads it
with its own model, and the fee moves on the value they agreed on, from money
the contract already holds. Nobody uploads a screenshot and nobody types
"done": the maker gives an address and the network reads it.

## Who may do what

| call | who | when |
|---|---|---|
| `open_studio(name, about, fee_atto, maker_seconds, client_seconds, step_seconds, cut_bps, max_cut_bps)` | anyone; the sender is the maker | the terms are fixed for good |
| `close_studio(studio)` / `reopen_studio(studio)` | the maker | stops or restarts new commissions only |
| `request_commission(studio, brief)`, payable | anyone but the maker | with exactly the fee, while the studio is open |
| `withdraw_request(commission)` | the client | before acceptance |
| `decline(commission)` | the maker | before acceptance |
| `accept(commission)` | the maker | within seven days of the request; the clock starts, the move on the maker |
| `say(commission, text)` | the maker or the client | while active; a press when the sender holds the move |
| `deliver(commission, url, note)` | the maker | while active |
| `take_move(commission)` | the maker or the client | while active, onto itself |
| `accept_work(commission)` | the client | once a delivery is recorded |
| `claim_silence(commission)` | the maker | while the client holds the move, is past its allowance, and has been charged 300 s on this turn |
| `cancel_late(commission)` | the client | while the maker holds the move, its cut is at the cap, and it has been charged 300 s on this turn |

Every write except `open_studio` refuses by who the sender is. `open_studio`
lets anyone open a studio, makes the sender its maker and touches nothing
outside it; the test suite lists it with that reason, and fails on any write
added later that checks no sender. Addresses are compared without letter case.

`request_commission` is the only payable call. It never asks the model and
never raises after taking value: a refusal returns everything sent in the same
transaction and answers `{"ok": false, "reason": ..., "returned": ...}`. The
other writes take no value and refuse by raising.

Views take a short id, a small number or one address, never a text and never a
time: `studio(id)`, `studios(offset, limit)`, `studios_of(address, offset,
limit)`, `commission(id)`, `messages_of(commission, offset, limit)`,
`commissions_of(address, offset, limit)`, `studio_commissions(studio, offset,
limit)`, `stats()` and `rules()`. Lists come in pages of at most 20.
`commission(id)` returns the clock as stored (`holder`, `since`, `handed_by`,
`grace`, `maker_used`, `client_used`), the terms, and `cap_after`, the maker's
use past which the cut is at its cap. It also returns `now`, the chain's clock
at the read, and `maker_live` and `client_live` worked out from it (all three
-1 when the read has no clock). A side's live use is its used seconds plus
`max(0, now - since - grace)` while it holds the move.

## The money

| moment | what moves |
|---|---|
| `request_commission` | the client pays exactly the fee; the contract holds it |
| `withdraw_request`, `decline` | the whole fee back to the client |
| `accept_work` | the maker gets `fee - cut`, the client gets `cut` |
| `claim_silence`, with a delivery | as `accept_work` |
| `claim_silence`, without | the maker gets `fee * min(2500, 10000 - cut_bps) // 10000`, the client the rest |
| `cancel_late`, without a delivery | the whole fee back to the client |
| `cancel_late`, with a delivery | as `accept_work` at the cap |
| a refused payable call | everything sent goes back to the sender, in the same transaction |

The late cut, from the seconds the contract stored:

```
maker_late = max(0, maker live use - maker_seconds)
cut_bps    = min(max_cut_bps, ceil(maker_late / step_seconds) * cut_bps)
cut        = fee * cut_bps // 10000
```

With the demonstration's terms (900 s, a step of 60 s, 10% a step, at most
50%): 900 s of use costs nothing, 901 s costs 10%, 961 s costs 20%, and from
1,141 s the cut is 50% and the client may cancel instead, once the maker's
current turn has been charged 300 s.

Every settlement is O(1), goes through one exit, and pays out exactly the held
fee: the client gets precisely what the maker does not. The contract always
holds exactly the fees of the commissions requested or active. The offline
suite checks that, and the clock, after every step of sixteen seeded random
journeys.

Each studio carries a public record, updated as things happen: commissions,
finished on time, finished late, cancelled late, lapsed, declined, withdrawn,
presses judged, passed, kept and unclear, deliveries judged, delivered and
missing, and the maker's total late seconds.

## The demonstration

Fernhill Pottery, a fictional potter, takes a commission from a shop with this
brief:

> A 150-word product description for a hand-thrown stoneware mug, 350 ml, for
> an online shop. Warm, plain English. Mention that it is dishwasher safe.

`drafts/` holds the pages a maker can deliver, as plain text, so every
validator reads the same words:

| page | what it is | judged |
|---|---|---|
| `mug-final.html` | the finished description, naming the sea-green glaze | delivered |
| `mug-revised.html` | the same with one sentence about gift wrapping, which the client asks for | delivered |
| `mug-placeholder.html` | "Draft coming soon." | missing |
| `mug-outline.html` | a bullet outline | missing |
| `teapot.html` | a finished description of a teapot: the wrong piece | missing |

The thread changes one thing per message:

| who | message | judged |
|---|---|---|
| client, while the maker holds the move | "Thank you for taking this on. The mug goes in our autumn listing." | noted |
| maker | "Which glaze should the description name? We make this mug in sea-green, oatmeal and charcoal, and the brief does not say which one this listing is for, so I need you to choose before I write it." | pass |
| client | "I'll get back to you on that." | keep |
| client | "Sea-green, please." | pass |
| maker | "Should the description be written in English?" | keep: the brief says so |
| maker | "Working on it, nearly there." | keep |
| maker | delivers `mug-placeholder.html` | missing |
| maker | delivers `mug-final.html` | delivered, the move to the client |

## The limits, stated plainly

- **A delivery page must read the same for every validator at that moment.**
  Each node fetches it separately and the fingerprint is compared. A page that
  changes between fetches, differs per visitor, or sits behind a login or a
  script will not settle, and nothing is stored. Static pages, and pages pinned
  to a commit, settle.
- **Text is read, images are not.** Validators read the page as text. A
  drawing, a photograph or a PDF is not judged; a delivery of visual work needs
  a page that states it in words, which this contract does not try to judge.
- **The first 8,000 characters are judged.** The whitespace of the page's
  first 32,000 characters is collapsed and the rest is cut, so the work never
  grows with the page. A longer piece should be delivered as a page whose first
  8,000 characters show it is complete.
- **An error page is not a delivery.** A page that answers 400 or above stores
  nothing, whatever its text says. A page whose commit is not pushed yet, or
  whose host is down, is delivered again once it answers.
- **Whoever controls the page controls what it says later.** The fingerprint
  records what the validators read at delivery. If the maker edits the page
  afterwards, the client can see that it no longer matches. Pages pinned to a
  commit cannot change.
- **The judgment is a reading of words, not of intent.** A sham question that
  the network reads as genuine moves the clock; a genuine one it reads as a
  formality does not. Disagreement lands on `unclear`, which leaves the move
  where it was, and either side can take the move onto itself. The six-message
  thread window means a question answered long before can be asked again
  without the network seeing the old answer. The message that handed the
  holder the move is always in the thread, however many notes came after it.
- **Seconds are the chain's.** Each transaction's own time is used, and a turn
  starts at the time of the transaction that began it. A turn is booked when
  the move changes hands, and settlement counts the running turn up to the
  settling transaction. A turn handed over by a round is not charged for its
  first 300 seconds; a turn a side takes itself is charged from its own
  transaction. A clock that reads earlier than the turn's start never moves the
  turn back, so no second is counted twice.
- **A request waits seven days.** After that the maker can no longer accept
  it; the client withdraws it or the maker declines it, and either way the
  whole fee goes back.
- **Someone has to settle.** A commission whose sides both go quiet waits.
  `claim_silence` and `cancel_late` open on the clock, but somebody has to call
  them.
- **The cap must be reachable.** A studio's terms must bring the cut to its
  cap within 30 days of the maker's allowance running out, so a client whose
  maker goes silent can always cancel.
- **Texts are printable ASCII on one line.** Names 3 to 60 characters, about
  lines up to 300, briefs 40 to 800, messages 1 to 600, notes up to 300.
  Delivery addresses are `https`, at most 200 characters, with a lowercase host,
  using letters, digits and `- . _ ~ / ? & = % + : @` only; no fragment. Fees
  are 0.1 to 100 GEN.

## What is in this repository

```
contracts/commission_clock.py   the contract
drafts/                         the five demo pages a maker can deliver
tests/test_pure.py              the offline suite, including the consensus rounds with a world per node
tests/MUTATIONS.md              every defence removed in turn, and the test that caught it
tests/on_chain/smoke.mjs        a throwaway-account run against Studio
tools/mutate.py                 the generator that writes MUTATIONS.md and refuses to if anything survives
docs/CONTRACTS.md               purpose, consensus, state, methods, loops and limits
docs/DECISIONS.md               why each rule is the way it is, and what is verified and what is not
web/                            the site (Next.js), its in-memory twin of the contract and its tests
```

## Running it

```
pip install -r requirements-dev.txt
pytest tests/ -q                              # no network, no Studio
genvm-lint check contracts/commission_clock.py
python tools/mutate.py                        # rewrites tests/MUTATIONS.md; exits 1 if a mutant survives
```

On this repository as it stands, `pytest tests/ -q` gives **207 passed** in
under a second. `genvm-lint check` (genvm-linter 0.11.0) prints
`Lint passed (3 checks)` and reports 22 methods, 9 view and 13 write.
`python tools/mutate.py` removes or inverts **263 defences** one at a time,
and **none survives**.

The on-chain run uses three throwaway keys it generates itself (MAKER, CLIENT,
STRANGER) and funds them from the Studio faucet. It never touches anybody's
own wallet. The validators read the drafts from GitHub at one commit, so push
the repository first and pass that commit:

```
npm ci
COMMIT=<40-character sha> node tests/on_chain/smoke.mjs        # about fifty minutes
COMMIT=<sha> RESUME=1 node tests/on_chain/smoke.mjs            # continue from the saved state
```

`REPO=<owner>/<name>` names the GitHub repository when the git remote does
not. The script fetches the drafts itself before it deploys anything and stops
if they are not at that commit. It opens a studio with short terms (a 1 GEN
fee, 900 s for the maker, 420 s for the client, 10% a started minute late, at
most 50%) and tells three commissions: the conversation above, ending in an
accepted delivery whose split is checked against the stored seconds; a client
who stays silent after a delivery, settled by the maker as accepted; and a
maker who stays silent until its cut reaches the cap, cancelled by the client
for a full refund. Along the way a stranger is refused, the maker's own request
is refused and refunded, and an early cancel and an early silence claim are
both refused. The early claim is sent only when the chain's clock shows at
least four minutes before a claim could open; if the deliver round and its wait
used more, it prints SKIP and why, rather than racing a claim that could
succeed. It prints a PASS or FAIL line for every check, the balances
before and after every step that moves money, `N passed, M failed`, and the
contract address.

## The site

`web/` is the site, a Next.js app (set its folder, `web`, as the Root Directory
on Vercel). It looks like a tournament chess clock on a games table: every
commission room shows the two faces, MAKER on the left and CLIENT on the
right, the side that holds the move lit amber and ticking, a red flag that
drops once a side is over its allowance, and every judged message stamped
with what the network agreed.

- `/` the promise in one minute, with a whole commission played on the real
  clock arithmetic at 25 times speed, and how the money moves.
- `/studio` the demo studio, Fernhill Pottery copy desk, with its terms read
  live; commission it with one wallet and the brief chip.
- `/c/C7` a commission's room: the clock, the thread, the composer (a
  message from the side that holds the move is a press; from the other side
  it is noted), the demo maker's next moves, a waiting panel while the
  validators judge a press or read a draft page, and the result slip.
- `/studios`, `/studios/S1` every studio and its public record; `/maker` open
  a studio and keep your own commissions moving; `/mine` your commissions;
  `/ledger` the contract's totals; `/how` the four askings word for word, the
  money table, the limits and `rules()` read live.

**One wallet tries everything.** A demo maker, a throwaway Studio key the
site's server holds in `DEMO_MAKER_KEY`, runs the demo studio on short terms
(0.5 GEN; 20 minutes for the maker, 10 for the client; 10% of the fee per
started 2 minutes late, at most 50%). A visitor commissions it and plays the
client; in the room the demo maker accepts and makes the moves its buttons
name, each shown with the verdict the network should reach: a real question
(the move goes over), a sham question and a progress update (it stays), a
placeholder, an outline and the wrong piece (missing), the finished
description and a revised one (delivered). It signs only those fixed moves:
`POST /api/demo/act` takes a commission id and one of eight action keys, and
nothing a visitor types ever reaches its key. `GET /api/demo/status` says
whether it is online or exactly why not (no key, a bad key, no contract,
Studio's RPC down, no GEN on its account, or no demo studio yet), and whether
it can deliver. The drafts it delivers are the files in `drafts/`, read from
raw.githubusercontent.com at the commit set as `DRAFTS_COMMIT` in
`web/lib/config.ts`; the site serves copies under `/drafts/` so a visitor can
read what every validator read.

Every in-between state says, in the same six lines, what is happening, how
long it takes, what is needed from you, who the clock runs against right now,
whether you can leave, and where the fee is (`web/lib/guide.ts`).

```
cd web
npm ci
npm run dev:mock          # the whole site on an in-memory copy of the contract, no wallet, no network
npm run typecheck && npm run lint && npm run test:site
npm run build
```

`NEXT_PUBLIC_MOCK=1` runs every page against `web/lib/chain-mock.ts`, which
follows the contract on everything deterministic (who may call what, the order
of the checks and their sentences, the clock with its grace and notice, the
cut, every atto) and scripts only what a model or a fetch would decide. The
site's tests run from node with no browser: every call builder and view
against `contracts/commission_clock.py`, the clock arithmetic and `rules()`
compared with the contract's own Python, every verdict and every settlement
through the mock, seeded random journeys with conservation checked after
every step, the waiting copy for every state and role, every suggestion
inside the limits, the demo maker's routes, and the hygiene of every file.

To bring the demo maker online after the contract is deployed and the
repository pushed: set `DEMO_CONTRACT` and `DRAFTS_COMMIT` in
`web/lib/config.ts` (or `NEXT_PUBLIC_CONTRACT` and `NEXT_PUBLIC_DRAFTS_COMMIT`),
run `REGISTER=0x... DEMO_MAKER_KEY=0x... COMMIT=<sha> node web/tools/open-demo-studio.mjs`
(`DRY=1` prints the call and sends nothing), set the same `DEMO_MAKER_KEY` on
the host, and check that `GET /api/demo/status` answers `"online": true`.

## Network

GenLayer Studio, chain 61999, RPC `https://studio.genlayer.com/api`, explorer
`https://explorer-studio.genlayer.com`. The contract pins the runner
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` in its first
line.

## Evidence

The on-chain run is recorded here once it has run.

## Licence

MIT; see `LICENSE`.
