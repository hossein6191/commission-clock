// POST /api/demo/accept {commission}: the demo maker accepts a request made of the demo studio, so its
// clock starts with the move on the maker. Requests of any other studio are refused. Rate-limited per
// commission and in total, one signature at a time; answers the transaction hash or why not. Nothing
// here ever logs or returns the key.

import { sendDemo } from "@/lib/demo-server";
import { parseCommissionId } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Two reads (retried while Studio is slow), perhaps a faucet payment, and one signature.
export const maxDuration = 60;

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  let id = "";
  try {
    const text = await request.text();
    if (text.length > 200) throw new Error("too long");
    const body = JSON.parse(text) as { commission?: unknown };
    id = typeof body.commission === "string" ? parseCommissionId(body.commission) : "";
  } catch {
    id = "";
  }
  if (!id) return Response.json({ ok: false, reason: 'send {"commission": "C1"}' }, { status: 400, headers: noStore });
  const answer = await sendDemo(id, "accept");
  return Response.json(answer.body, { status: answer.status, headers: noStore });
}
