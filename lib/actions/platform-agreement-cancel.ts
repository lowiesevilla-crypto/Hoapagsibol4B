"use server";

import { AgreementAuditEventType, Role, TenantAgreementStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { platformPrisma as prisma } from "@/lib/db";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

async function requirePlatformAgreementUser() {
  const user = await requireUser();
  if (!user.roles.includes(Role.SUPER_ADMIN) && !user.roles.includes(Role.PLATFORM_ADMIN)) redirect("/admin/dashboard");
  return user;
}

export async function cancelPlatformAgreementAction(formData: FormData) {
  const actor = await requirePlatformAgreementUser();
  const agreementId = clean(formData.get("agreementId"));
  const reason = clean(formData.get("reason"));
  if (reason.length < 5) redirect(`/platform/agreements/${encodeURIComponent(agreementId)}?error=Enter%20a%20clear%20cancellation%20reason.`);

  try {
    const agreement = await prisma.tenantSubscriptionAgreement.findUnique({ where: { id: agreementId } });
    if (!agreement) throw new Error("Agreement not found.");
    if ([TenantAgreementStatus.TERMINATED, TenantAgreementStatus.SUPERSEDED, TenantAgreementStatus.EXPIRED].includes(agreement.status)) {
      throw new Error("This agreement is already in a terminal state.");
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.tenantSubscriptionAgreement.update({
        where: { id: agreement.id },
        data: {
          status: TenantAgreementStatus.TERMINATED,
          terminatedAt: now,
          terminationReason: reason,
        },
      });
      await tx.agreementSignatureChallenge.updateMany({
        where: { agreementId: agreement.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.agreementAuditEvent.create({
        data: {
          agreementId: agreement.id,
          tenantId: agreement.tenantId,
          eventType: AgreementAuditEventType.TERMINATED,
          actorUserId: actor.id,
          actorEmail: actor.email,
          metadata: {
            reason,
            priorStatus: agreement.status,
            signedAgreementRecordPreserved: Boolean(agreement.signedAt),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: agreement.tenantId,
          actorId: actor.id,
          module: "PLATFORM_AGREEMENTS",
          action: "AGREEMENT_CANCELLED_BY_PLATFORM",
          entityType: "TenantSubscriptionAgreement",
          entityId: agreement.id,
          metadata: {
            agreementNumber: agreement.agreementNumber,
            priorStatus: agreement.status,
            reason,
            signedAt: agreement.signedAt?.toISOString() || null,
          },
        },
      });
    });
  } catch (error) {
    redirect(`/platform/agreements/${encodeURIComponent(agreementId)}?error=${encodeURIComponent(error instanceof Error ? error.message : "Agreement cancellation failed.")}`);
  }

  revalidatePath("/platform/agreements");
  revalidatePath(`/platform/agreements/${agreementId}`);
  revalidatePath("/admin/agreement");
  redirect(`/platform/agreements/${agreementId}?success=Agreement%20cancelled%20and%20preserved%20in%20the%20audit%20trail.`);
}
