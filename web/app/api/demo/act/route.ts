// POST /api/demo/act {commission, action}: the demo maker does ONE thing from its fixed script on an
// active commission of the demo studio: "question", "sham" or "update" (a message), or "placeholder",
// "outline", "wrong", "final" or "revised" (a delivery of a draft pinned to one commit). The action is
// a key into that list; no text from the visitor is ever signed. One move at a time per commission,
// rate-limited; answers the transaction hash or why not. Nothing here ever logs or returns the key.

import { ACTION_KEYS } from "@/lib/demo-studio";
import { sendDemo } from "@/lib/demo-server";
import { parseCommissionId } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Two reads (retried while Studio is slow), perhaps a faucet payment, and one signature.
export const maxDuration = 60;

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  let id = "";
  let action = "";
  try {
    const text = await request.text();
    if (text.length > 200) throw new Error("too long");
    const body = JSON.parse(text) as { commission?: unknown; action?: unknown };
    id = typeof body.commission === "string" ? parseCommissionId(body.commission) : "";
    action = typeof body.action === "string" && (ACTION_KEYS as string[]).includes(body.action) ? body.action : "";
  } catch {
    id = "";
  }
  if (!id || !action) return Response.json({ ok: false, reason: `send {"commission": "C1", "action": one of ${ACTION_KEYS.join(", ")}}` }, { status: 400, headers: noStore });
  const answer = await sendDemo(id, action);
  return Response.json(answer.body, { status: answer.status, headers: noStore });
}
