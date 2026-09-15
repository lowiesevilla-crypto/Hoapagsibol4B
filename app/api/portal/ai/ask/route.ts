import { NextResponse } from "next/server";
import { tryAnswerAiBusinessQuestion } from "@/lib/ai-assistance/business-orchestrator";
import { AiOperationalError } from "@/lib/ai-assistance/operational-error";
import { answerTenantKnowledgeQuestionWithReasoning } from "@/lib/ai-assistance/reasoning-assistant";

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
    const input = { experience: "RESIDENT" as const, question: body.question, conversationId };
    const businessAnswer = await tryAnswerAiBusinessQuestion(input);
    const result = businessAnswer ?? await answerTenantKnowledgeQuestionWithReasoning(input);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "HOAHub AI could not process this request.";
    const status = statusForAiError(message);
    const operational = error instanceof AiOperationalError ? { code: error.code, requestId: error.requestId } : {};
    return NextResponse.json({ error: message, ...operational }, {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
