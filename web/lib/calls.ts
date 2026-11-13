// One builder per write method of the contract: the method's name, its arguments in the contract's
// order, and the value sent. Pure, so tests/unit/interface.test.mjs checks every builder against the
// signatures in contracts/commission_clock.py with no browser and no network.

import type { Call } from "./types.ts";

const int = (n: number): number => Math.trunc(n);

export const calls = {
  /**
   * open_studio(name, about, fee_atto, maker_seconds, client_seconds, step_seconds, cut_bps, max_cut_bps, stages): anyone; the
   * sender is the maker. The fee travels as digits; `stages` is "" for one stage, else name=share[=what it holds] joined by |.
   */
  openStudio: (name: string, about: string, feeAtto: bigint, makerSeconds: number, clientSeconds: number, stepSeconds: number, cutBps: number, maxCutBps: number, stages = ""): Call => ({
    fn: "open_studio",
    args: [name, about, feeAtto.toString(), int(makerSeconds), int(clientSeconds), int(stepSeconds), int(cutBps), int(maxCutBps), stages],
  }),
  /** close_studio(studio): the maker stops new commissions. */
  closeStudio: (studio: string): Call => ({ fn: "close_studio", args: [studio] }),
  /** reopen_studio(studio): the maker takes new commissions again. */
  reopenStudio: (studio: string): Call => ({ fn: "reopen_studio", args: [studio] }),
  /** request_commission(studio, brief), payable: exactly the fee. A refused request returns what was sent in the same transaction. */
  requestCommission: (studio: string, brief: string, feeAtto: bigint): Call => ({ fn: "request_commission", args: [studio, brief], value: feeAtto }),
  /** withdraw_request(commission): the client, before acceptance. */
  withdrawRequest: (commission: string): Call => ({ fn: "withdraw_request", args: [commission] }),
  /** decline(commission): the maker, before acceptance. */
  decline: (commission: string): Call => ({ fn: "decline", args: [commission] }),
  /** accept(commission): the maker, within seven days of the request. The clock starts with the move on the maker. */
  accept: (commission: string): Call => ({ fn: "accept", args: [commission] }),
  /** say(commission, text): a press when the sender holds the move, judged in the same call; noted otherwise. */
  say: (commission: string, text: string): Call => ({ fn: "say", args: [commission, text] }),
  /** deliver(commission, url, note): the maker; every validator reads the page on the live web in the same call. */
  deliver: (commission: string, url: string, note: string): Call => ({ fn: "deliver", args: [commission, url, note] }),
  /** take_move(commission): a party takes the move onto itself. */
  takeMove: (commission: string): Call => ({ fn: "take_move", args: [commission] }),
  /** accept_stage(commission): the client, once a delivery stands for the current stage; that stage's share is paid at once. */
  acceptStage: (commission: string): Call => ({ fn: "accept_stage", args: [commission] }),
  /** accept_work(commission): the one-stage name for accept_stage, kept. */
  acceptWork: (commission: string): Call => ({ fn: "accept_work", args: [commission] }),
  /** appeal(commission, reason): the side the latest verdict went against, within the window, once, with the bond in its credit. */
  appeal: (commission: string, reason: string): Call => ({ fn: "appeal", args: [commission, reason] }),
  /** deposit(), payable: adds what is sent to the sender's credit for appeal bonds. */
  deposit: (amountAtto: bigint): Call => ({ fn: "deposit", args: [], value: amountAtto }),
  /** withdraw(amount): pays part or all of the sender's own credit back to the sender. The amount travels as digits. */
  withdraw: (amountAtto: bigint): Call => ({ fn: "withdraw", args: [amountAtto.toString()] }),
  /** claim_silence(commission): the maker, once the client is past its allowance and its turn has had its notice. */
  claimSilence: (commission: string): Call => ({ fn: "claim_silence", args: [commission] }),
  /** cancel_late(commission): the client, once the maker's cut is at the cap and its turn has had its notice. */
  cancelLate: (commission: string): Call => ({ fn: "cancel_late", args: [commission] }),
};
