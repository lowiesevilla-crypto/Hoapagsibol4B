"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function clean(value: FormDataEntryValue | null, limit = 1000) {
  return String(value || "").trim().slice(0, limit);
}

export async function submitAiFeedbackAction(formData: FormData) {
  const user = await requireUser();
  const requestId = clean(formData.get("requestId"), 190);
  const conversationId = clean(formData.get("conversationId"), 190) || null;
  const rating = Number(clean(formData.get("rating"), 4));
  const reason = clean(formData.get("reason"), 1000);
  if (!requestId) throw new Error("AI request feedback is missing the request reference.");
  if (![1, -1].includes(rating)) throw new Error("Select a valid AI feedback rating.");

  const request = await prisma.aiUsageLedger.findFirst({
    where: { tenantId: user.tenantId, requestId, actorId: user.id },
    select: { id: true },
  });
  if (!request) throw new Error("AI request feedback is unavailable for this signed-in user.");

  await prisma.aiFeedback.create({
    data: {
      tenantId: user.tenantId,
      actorId: user.id,
      conversationId,
      rating,
      flagged: rating < 0 || Boolean(reason),
      reason: reason || null,
    },
  });
  revalidatePath("/portal/ai");
  revalidatePath("/admin/ai-copilot");
}
