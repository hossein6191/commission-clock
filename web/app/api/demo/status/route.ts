// GET /api/demo/status: whether the demo maker can act now, its public address, the studio it runs,
// and exactly why not when it cannot: "no key set", "the key set is not a 0x private key of 64 hex
// characters", "the contract is not deployed yet", Studio's RPC not answering, no GEN on its account,
// or the demo studio not open on this contract yet. `drafts` says whether it can deliver, and
// `draftsReason` why not. The key itself is never echoed.

import { demoStatusNow } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A balance read (perhaps a faucet payment) and one read of studios_of, retried while Studio is slow.
export const maxDuration = 60;

export async function GET() {
  return Response.json(await demoStatusNow(), { headers: { "cache-control": "no-store" } });
}
