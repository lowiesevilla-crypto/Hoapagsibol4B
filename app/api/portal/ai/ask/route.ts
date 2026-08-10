import { NextResponse } from "next/server";
import { answerTenantKnowledgeQuestion } from "@/lib/ai-assistance/knowledge-assistant";

export const runtime = "nodejs";

function statusForAiError(message: string) {
  if (/temporarily unavailable|provider error/i.test(message)) return 503;
  if (/not included|permission|authenticated|unavailable:|active tenant/i.test(message)) return 403;
  if (/rate limit|allowance|budget/i.test(message)) return 429;
  return 400;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { question?: unknown; conversationId?: unknown };
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() || null : null;
    const result = await answerTenantKnowledgeQuestion({ experience: "RESIDENT", question: body.question, conversationId });
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "HOAHub AI could not process this request.";
    const status = statusForAiError(message);
    return NextResponse.json({ error: message }, {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
