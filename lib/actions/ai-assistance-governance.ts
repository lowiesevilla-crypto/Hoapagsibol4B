"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAiAssistanceEntitlement } from "@/lib/ai-assistance/entitlement";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

async function requireAiGovernanceManager() {
  const user = await requireUser();
  if (!new Set(user.permissions).has(Permission.AI_ASSISTANCE_MANAGE)) throw new Error("AI Assistance management permission is required.");
  await requireAiAssistanceEntitlement(user.tenantId);
  return user;
}

function approvalDate(enabled: boolean, existing: Date | null | undefined, now: Date) {
  return enabled ? existing ?? now : null;
}

export async function saveTenantAiGovernanceAction(formData: FormData) {
  const user = await requireAiGovernanceManager();
  let errorMessage = "";
  try {
    const existing = await prisma.tenantAiConfiguration.findUnique({ where: { tenantId: user.tenantId } });
    const now = new Date();
    const lawfulBasis = clean(formData.get("lawfulBasis"));
    const privacyNoticeVersion = clean(formData.get("privacyNoticeVersion"));
    const dataSubjectRightsContact = clean(formData.get("dataSubjectRightsContact"));
    const retentionDays = Number(clean(formData.get("retentionDays")) || "30");
    if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error("AI conversation retention must be between 1 and 3650 days.");

    const boardApprovedAt = approvalDate(checked(formData, "boardApproved"), existing?.boardApprovedAt, now);
    const piaApprovedAt = approvalDate(checked(formData, "piaApproved"), existing?.piaApprovedAt, now);
    const dpoApprovedAt = approvalDate(checked(formData, "dpoApproved"), existing?.dpoApprovedAt, now);
    const providerApprovedAt = approvalDate(checked(formData, "providerApproved"), existing?.providerApprovedAt, now);
    const crossBorderReviewApprovedAt = approvalDate(checked(formData, "crossBorderReviewApproved"), existing?.crossBorderReviewApprovedAt, now);
    const privacyNoticePublishedAt = approvalDate(checked(formData, "privacyNoticePublished"), existing?.privacyNoticePublishedAt, now);
    const runtimeEnabled = checked(formData, "runtimeEnabled");
    const residentAssistantEnabled = checked(formData, "residentAssistantEnabled");
    const staffCopilotEnabled = checked(formData, "staffCopilotEnabled");
    const documentRequestActionsEnabled = checked(formData, "documentRequestActionsEnabled");

    if (runtimeEnabled) {
      const missing = [
        !boardApprovedAt && "board/HOA approval",
        !piaApprovedAt && "PIA approval",
        !dpoApprovedAt && "DPO/privacy approval",
        !providerApprovedAt && "AI provider/vendor approval",
        !crossBorderReviewApprovedAt && "cross-border/subprocessor review",
        (!privacyNoticePublishedAt || !privacyNoticeVersion) && "published privacy notice/version",
        !lawfulBasis && "documented lawful basis",
        !dataSubjectRightsContact && "data-subject rights contact",
      ].filter(Boolean);
      if (missing.length) throw new Error(`AI runtime cannot be enabled until these governance gates are recorded: ${missing.join(", ")}.`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.tenantAiConfiguration.upsert({
        where: { tenantId: user.tenantId },
        update: {
          runtimeEnabled,
          residentAssistantEnabled,
          staffCopilotEnabled,
          documentRequestActionsEnabled,
          boardApprovedAt,
          piaApprovedAt,
          dpoApprovedAt,
          providerApprovedAt,
          crossBorderReviewApprovedAt,
          privacyNoticeVersion: privacyNoticeVersion || null,
          privacyNoticePublishedAt,
          lawfulBasis: lawfulBasis || null,
          retentionDays,
          dataSubjectRightsContact: dataSubjectRightsContact || null,
          killSwitchReason: runtimeEnabled ? null : clean(formData.get("killSwitchReason")) || existing?.killSwitchReason || null,
          approvedById: runtimeEnabled ? user.id : existing?.approvedById ?? null,
          updatedById: user.id,
        },
        create: {
          tenantId: user.tenantId,
          runtimeEnabled,
          residentAssistantEnabled,
          staffCopilotEnabled,
          documentRequestActionsEnabled,
          boardApprovedAt,
          piaApprovedAt,
          dpoApprovedAt,
          providerApprovedAt,
          crossBorderReviewApprovedAt,
          privacyNoticeVersion: privacyNoticeVersion || null,
          privacyNoticePublishedAt,
          lawfulBasis: lawfulBasis || null,
          retentionDays,
          dataSubjectRightsContact: dataSubjectRightsContact || null,
          killSwitchReason: runtimeEnabled ? null : clean(formData.get("killSwitchReason")) || null,
          approvedById: runtimeEnabled ? user.id : null,
          updatedById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorId: user.id,
          module: "AI_ASSISTANCE",
          action: "AI_GOVERNANCE_UPDATED",
          entityType: "TenantAiConfiguration",
          entityId: user.tenantId,
          metadata: {
            runtimeEnabled,
            residentAssistantEnabled,
            staffCopilotEnabled,
            documentRequestActionsEnabled,
            boardApproved: Boolean(boardApprovedAt),
            piaApproved: Boolean(piaApprovedAt),
            dpoApproved: Boolean(dpoApprovedAt),
            providerApproved: Boolean(providerApprovedAt),
            crossBorderReviewApproved: Boolean(crossBorderReviewApprovedAt),
            privacyNoticeVersion: privacyNoticeVersion || null,
            privacyNoticePublished: Boolean(privacyNoticePublishedAt),
            lawfulBasisRecorded: Boolean(lawfulBasis),
            retentionDays,
            dataSubjectRightsContactConfigured: Boolean(dataSubjectRightsContact),
          },
          aiAction: false,
        },
      });
    });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "AI governance settings could not be saved.";
  }

  revalidatePath("/admin/ai-assistance");
  revalidatePath("/portal/ai");
  if (errorMessage) redirect(`/admin/ai-assistance?error=${encodeURIComponent(errorMessage)}`);
  redirect(`/admin/ai-assistance?success=${encodeURIComponent("AI governance and privacy controls updated.")}`);
}
