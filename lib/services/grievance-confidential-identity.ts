import "server-only";

import { ComplaintIdentityAccessStatus, ComplaintPrivacyMode, ComplaintTimelineEventType, type Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { getActiveGrievancePermissions } from "@/lib/services/grievance-foundation";

type EffectiveUser = {
  id: string;
  tenantId: string;
  roles: Role[];
  role?: Role;
  name?: string;
};

export async function hasExplicitCommitteeIdentityRevealPermission(user: EffectiveUser) {
  const permissions = await getActiveGrievancePermissions(user.tenantId, user.id);
  return permissions.has("REVEAL_CONFIDENTIAL_IDENTITY");
}

export async function revealConfidentialIdentityWithCommitteePermission(user: EffectiveUser, formData: FormData) {
  if (!await hasExplicitCommitteeIdentityRevealPermission(user)) {
    throw new Error("Confidential identity reveal requires an explicit active Grievance Committee reveal permission.");
  }
  const id = String(formData.get("id") || "").trim().slice(0, 80);
  const reason = String(formData.get("reason") || "").trim().slice(0, 1000);
  const confirmed = formData.get("confirmReveal") === "on" || formData.get("confirmReveal") === "true";
  if (reason.length < 10) throw new Error("Enter a business reason for confidential identity reveal.");
  if (!confirmed) throw new Error("Confirm that the confidential identity reveal is necessary.");

  const complaint = await platformPrisma.complaint.findFirst({
    where: { tenantId: user.tenantId, id, privacyMode: ComplaintPrivacyMode.CONFIDENTIAL },
    select: {
      id: true,
      publicReference: true,
      confidentialIdentity: { select: { displayName: true, email: true, phone: true, propertyAddress: true, block: true, lot: true } },
    },
  });
  if (!complaint || !complaint.confidentialIdentity) throw new Error("Confidential complaint not found.");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  const grant = await platformPrisma.$transaction(async (tx) => {
    const access = await tx.complaintIdentityAccessGrant.create({
      data: {
        tenantId: user.tenantId,
        complaintId: complaint.id,
        requestedById: user.id,
        approvedById: user.id,
        purpose: "Grievance Committee confidential identity reveal",
        reason,
        status: ComplaintIdentityAccessStatus.APPROVED,
        decidedAt: now,
        expiresAt,
      },
    });
    await tx.complaintTimelineEvent.create({
      data: {
        tenantId: user.tenantId,
        complaintId: complaint.id,
        actorId: user.id,
        eventType: ComplaintTimelineEventType.IDENTITY_DISCLOSED,
        message: "Confidential identity disclosed under explicit Grievance Committee permission.",
        metadata: { accessGrantId: access.id, authority: "REVEAL_CONFIDENTIAL_IDENTITY" },
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "COMPLAINTS",
        action: "REVEAL_CONFIDENTIAL_IDENTITY",
        entityType: "Complaint",
        entityId: complaint.id,
        metadata: {
          publicReference: complaint.publicReference,
          result: "APPROVED",
          accessGrantId: access.id,
          hasReason: true,
          authority: "REVEAL_CONFIDENTIAL_IDENTITY",
        },
      },
    });
    return access;
  });

  return {
    publicReference: complaint.publicReference,
    displayName: complaint.confidentialIdentity.displayName,
    email: complaint.confidentialIdentity.email,
    phone: complaint.confidentialIdentity.phone,
    propertyAddress: complaint.confidentialIdentity.propertyAddress,
    block: complaint.confidentialIdentity.block,
    lot: complaint.confidentialIdentity.lot,
    revealedAt: now.toISOString(),
    expiresAt: grant.expiresAt?.toISOString() ?? null,
  };
}
