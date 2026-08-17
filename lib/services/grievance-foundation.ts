import "server-only";

import { randomUUID } from "node:crypto";
import { ComplaintPrivacyMode, Role, type Prisma } from "@prisma/client";
import { platformPrisma } from "@/lib/db";

export const grievancePermissions = [
  "VIEW_GRIEVANCE",
  "TRIAGE_GRIEVANCE",
  "VERIFY_GRIEVANCE",
  "CONDUCT_MEDIATION",
  "CONDUCT_HEARING",
  "RECORD_MINUTES",
  "VOTE_GRIEVANCE",
  "REVEAL_CONFIDENTIAL_IDENTITY",
  "APPROVE_ENFORCEMENT",
] as const;

export type GrievancePermission = typeof grievancePermissions[number];
export type GrievanceCommitteePosition = "CHAIR" | "MEMBER" | "SECRETARY" | "MEDIATOR";
export type ComplaintSubjectType = "HOMEOWNER" | "PROPERTY" | "VEHICLE" | "COMMON_AREA" | "UNKNOWN";
export type ComplaintVerificationType = "SITE_INSPECTION" | "SECURITY_REPORT" | "CCTV_REVIEW" | "STAFF_OBSERVATION" | "DOCUMENT_REVIEW" | "MULTIPLE_INDEPENDENT_REPORTS" | "OTHER";
export type ComplaintVerificationStatus = "NOT_REQUIRED" | "PENDING" | "IN_PROGRESS" | "PASSED" | "FAILED" | "INSUFFICIENT";
export type GrievanceDeadlineType = "RESPONDENT_RESPONSE" | "MEDIATION_SCHEDULING" | "HEARING_NOTICE" | "RECONSIDERATION" | "APPEAL" | "CORRECTIVE_ACTION";

type EffectiveUser = {
  id: string;
  tenantId: string;
  roles: Role[];
  role?: Role;
  name?: string;
};

type PermissionRow = { permissions: unknown };
type VerificationRow = {
  id: string;
  required: number | boolean;
  blocksEnforcement: number | boolean;
  status: ComplaintVerificationStatus;
};
type GrievanceRow = {
  id: string;
  tenantId: string;
  complaintId: string;
  status: string;
  boardReviewRequired: number | boolean;
};

const platformRoles = new Set<Role>([Role.SUPER_ADMIN, Role.PLATFORM_ADMIN]);
const grievanceAdminRoles = new Set<Role>([Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN]);
const positions = new Set<GrievanceCommitteePosition>(["CHAIR", "MEMBER", "SECRETARY", "MEDIATOR"]);
const subjectTypes = new Set<ComplaintSubjectType>(["HOMEOWNER", "PROPERTY", "VEHICLE", "COMMON_AREA", "UNKNOWN"]);
const verificationTypes = new Set<ComplaintVerificationType>(["SITE_INSPECTION", "SECURITY_REPORT", "CCTV_REVIEW", "STAFF_OBSERVATION", "DOCUMENT_REVIEW", "MULTIPLE_INDEPENDENT_REPORTS", "OTHER"]);
const verificationStatuses = new Set<ComplaintVerificationStatus>(["NOT_REQUIRED", "PENDING", "IN_PROGRESS", "PASSED", "FAILED", "INSUFFICIENT"]);
const deadlineTypes = new Set<GrievanceDeadlineType>(["RESPONDENT_RESPONSE", "MEDIATION_SCHEDULING", "HEARING_NOTICE", "RECONSIDERATION", "APPEAL", "CORRECTIVE_ACTION"]);

function normalizedRoles(user: EffectiveUser) {
  return new Set<Role>([...(user.roles || []), ...(user.role ? [user.role] : [])]);
}

function hasAdminAuthority(user: EffectiveUser) {
  const roles = normalizedRoles(user);
  if ([...roles].some((role) => platformRoles.has(role))) return false;
  return [...roles].some((role) => grievanceAdminRoles.has(role));
}

function normalizePermissions(value: unknown): GrievancePermission[] {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(candidate)) return [];
  const allowed = new Set<string>(grievancePermissions);
  return [...new Set(candidate.map(String).filter((item): item is GrievancePermission => allowed.has(item)))];
}

async function audit(input: { tenantId: string; actorId: string | null; action: string; entityType: string; entityId: string; metadata?: Prisma.InputJsonValue }) {
  await platformPrisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      module: "COMPLAINTS",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
}

async function activity(input: { tenantId: string; complaintId: string; grievanceCaseId?: string | null; actorId?: string | null; eventType: string; message: string; metadata?: Record<string, unknown> }) {
  await platformPrisma.$executeRaw`
    INSERT INTO ComplaintGrievanceActivity
      (id, tenantId, complaintId, grievanceCaseId, actorId, eventType, message, metadata, createdAt)
    VALUES
      (${randomUUID()}, ${input.tenantId}, ${input.complaintId}, ${input.grievanceCaseId ?? null}, ${input.actorId ?? null}, ${input.eventType}, ${input.message}, ${input.metadata ? JSON.stringify(input.metadata) : null}, NOW(3))
  `;
}

export async function getActiveGrievancePermissions(tenantId: string, userId: string) {
  const rows = await platformPrisma.$queryRaw<PermissionRow[]>`
    SELECT permissions
    FROM GrievanceCommitteeMembership
    WHERE tenantId = ${tenantId}
      AND userId = ${userId}
      AND active = true
      AND startsAt <= NOW(3)
      AND (endsAt IS NULL OR endsAt > NOW(3))
  `;
  return new Set(rows.flatMap((row) => normalizePermissions(row.permissions)));
}

export async function requireGrievancePermission(user: EffectiveUser, permission: GrievancePermission) {
  if (hasAdminAuthority(user)) return;
  const permissions = await getActiveGrievancePermissions(user.tenantId, user.id);
  if (!permissions.has(permission)) throw new Error("You do not have permission to perform this grievance action.");
}

export async function addComplaintSubject(user: EffectiveUser, input: {
  complaintId: string;
  subjectType: ComplaintSubjectType;
  homeownerId?: string | null;
  vehicleId?: string | null;
  displayLabel?: string | null;
}) {
  await requireGrievancePermission(user, "TRIAGE_GRIEVANCE");
  if (!subjectTypes.has(input.subjectType)) throw new Error("Choose a valid complaint subject type.");
  const complaint = await platformPrisma.complaint.findFirst({
    where: { tenantId: user.tenantId, id: input.complaintId },
    select: { id: true },
  });
  if (!complaint) throw new Error("Complaint not found.");

  let homeowner: { id: string; phase: string | null; block: string; lot: string; address: string } | null = null;
  let vehicle: { id: string; homeownerId: string; plateNumber: string } | null = null;
  if (input.homeownerId) {
    homeowner = await platformPrisma.homeownerProfile.findFirst({
      where: { tenantId: user.tenantId, id: input.homeownerId },
      select: { id: true, phase: true, block: true, lot: true, address: true },
    });
    if (!homeowner) throw new Error("The selected property subject is not available in this HOA.");
  }
  if (input.vehicleId) {
    vehicle = await platformPrisma.vehicle.findFirst({
      where: { tenantId: user.tenantId, id: input.vehicleId },
      select: { id: true, homeownerId: true, plateNumber: true },
    });
    if (!vehicle) throw new Error("The selected vehicle subject is not available in this HOA.");
    if (!homeowner) {
      homeowner = await platformPrisma.homeownerProfile.findFirst({
        where: { tenantId: user.tenantId, id: vehicle.homeownerId },
        select: { id: true, phase: true, block: true, lot: true, address: true },
      });
    }
  }
  if ((input.subjectType === "HOMEOWNER" || input.subjectType === "PROPERTY") && !homeowner) {
    throw new Error("Select a same-HOA homeowner/property for this subject.");
  }
  if (input.subjectType === "VEHICLE" && !vehicle) throw new Error("Select a same-HOA vehicle for this subject.");

  const id = randomUUID();
  const safeLabel = String(input.displayLabel || (vehicle ? `Vehicle ${vehicle.plateNumber}` : "")).trim().slice(0, 191) || null;
  await platformPrisma.$executeRaw`
    INSERT INTO ComplaintSubject
      (id, tenantId, complaintId, subjectType, homeownerId, vehicleId, displayLabel, phaseSnapshot, blockSnapshot, lotSnapshot, addressSnapshot, createdById, createdAt, updatedAt)
    VALUES
      (${id}, ${user.tenantId}, ${complaint.id}, ${input.subjectType}, ${homeowner?.id ?? null}, ${vehicle?.id ?? null}, ${safeLabel}, ${homeowner?.phase ?? null}, ${homeowner?.block ?? null}, ${homeowner?.lot ?? null}, ${homeowner?.address ?? null}, ${user.id}, NOW(3), NOW(3))
  `;
  await activity({ tenantId: user.tenantId, complaintId: complaint.id, actorId: user.id, eventType: "SUBJECT_ADDED", message: "Structured complaint subject added.", metadata: { subjectId: id, subjectType: input.subjectType } });
  await audit({ tenantId: user.tenantId, actorId: user.id, action: "ADD_COMPLAINT_SUBJECT", entityType: "Complaint", entityId: complaint.id, metadata: { subjectId: id, subjectType: input.subjectType } });
  return { id };
}

export async function upsertComplaintVerificationPolicy(user: EffectiveUser, input: {
  policyKey: string;
  categoryId?: string | null;
  privacyMode?: ComplaintPrivacyMode | null;
  verificationRequired: boolean;
  blocksEnforcement: boolean;
  active?: boolean;
}) {
  if (!hasAdminAuthority(user)) throw new Error("Only an authorized HOA administrator may change grievance verification policy.");
  const policyKey = String(input.policyKey || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_").slice(0, 120);
  if (policyKey.length < 3) throw new Error("Enter a valid verification policy key.");
  if (input.categoryId) {
    const category = await platformPrisma.complaintCategory.findFirst({ where: { tenantId: user.tenantId, id: input.categoryId }, select: { id: true } });
    if (!category) throw new Error("Complaint category not found in this HOA.");
  }
  if (input.privacyMode && !Object.values(ComplaintPrivacyMode).includes(input.privacyMode)) throw new Error("Choose a valid complaint privacy mode.");
  const id = randomUUID();
  await platformPrisma.$executeRaw`
    INSERT INTO ComplaintVerificationPolicy
      (id, tenantId, policyKey, categoryId, privacyMode, verificationRequired, blocksEnforcement, active, createdById, updatedById, createdAt, updatedAt)
    VALUES
      (${id}, ${user.tenantId}, ${policyKey}, ${input.categoryId ?? null}, ${input.privacyMode ?? null}, ${input.verificationRequired}, ${input.blocksEnforcement}, ${input.active ?? true}, ${user.id}, ${user.id}, NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE
      categoryId = VALUES(categoryId),
      privacyMode = VALUES(privacyMode),
      verificationRequired = VALUES(verificationRequired),
      blocksEnforcement = VALUES(blocksEnforcement),
      active = VALUES(active),
      updatedById = VALUES(updatedById),
      updatedAt = NOW(3)
  `;
  await audit({ tenantId: user.tenantId, actorId: user.id, action: "UPSERT_COMPLAINT_VERIFICATION_POLICY", entityType: "ComplaintVerificationPolicy", entityId: policyKey, metadata: { categoryId: input.categoryId ?? null, privacyMode: input.privacyMode ?? null, verificationRequired: input.verificationRequired, blocksEnforcement: input.blocksEnforcement } });
  return { policyKey };
}

export async function evaluateComplaintVerificationRequirement(tenantId: string, complaintId: string) {
  const complaint = await platformPrisma.complaint.findFirst({
    where: { tenantId, id: complaintId },
    select: { id: true, categoryId: true, privacyMode: true },
  });
  if (!complaint) throw new Error("Complaint not found.");
  const policies = await platformPrisma.$queryRaw<Array<{ verificationRequired: number | boolean; blocksEnforcement: number | boolean }>>`
    SELECT verificationRequired, blocksEnforcement
    FROM ComplaintVerificationPolicy
    WHERE tenantId = ${tenantId}
      AND active = true
      AND (categoryId IS NULL OR categoryId = ${complaint.categoryId})
      AND (privacyMode IS NULL OR privacyMode = ${complaint.privacyMode})
  `;
  const required = policies.some((policy) => Boolean(policy.verificationRequired));
  const blocksEnforcement = required && policies.some((policy) => Boolean(policy.blocksEnforcement));
  const id = randomUUID();
  await platformPrisma.$executeRaw`
    INSERT INTO ComplaintVerification
      (id, tenantId, complaintId, required, blocksEnforcement, status, createdAt, updatedAt)
    VALUES
      (${id}, ${tenantId}, ${complaint.id}, ${required}, ${blocksEnforcement}, ${required ? "PENDING" : "NOT_REQUIRED"}, NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE
      required = VALUES(required),
      blocksEnforcement = VALUES(blocksEnforcement),
      status = CASE
        WHEN status = 'PASSED' THEN status
        WHEN VALUES(required) = false THEN 'NOT_REQUIRED'
        WHEN status IN ('IN_PROGRESS', 'FAILED', 'INSUFFICIENT') THEN status
        ELSE 'PENDING'
      END,
      updatedAt = NOW(3)
  `;
  const rows = await platformPrisma.$queryRaw<VerificationRow[]>`
    SELECT id, required, blocksEnforcement, status
    FROM ComplaintVerification
    WHERE tenantId = ${tenantId} AND complaintId = ${complaint.id}
    LIMIT 1
  `;
  return rows[0];
}

export async function recordComplaintVerification(user: EffectiveUser, input: {
  complaintId: string;
  status: ComplaintVerificationStatus;
  verificationType?: ComplaintVerificationType | null;
  findings?: string | null;
}) {
  await requireGrievancePermission(user, "VERIFY_GRIEVANCE");
  if (!verificationStatuses.has(input.status) || input.status === "NOT_REQUIRED" || input.status === "PENDING") throw new Error("Choose a valid verification result.");
  if (input.verificationType && !verificationTypes.has(input.verificationType)) throw new Error("Choose a valid verification type.");
  const findings = String(input.findings || "").trim().slice(0, 8000);
  if ((input.status === "PASSED" || input.status === "FAILED" || input.status === "INSUFFICIENT") && findings.length < 10) throw new Error("Record verification findings before completing verification.");
  const verification = await evaluateComplaintVerificationRequirement(user.tenantId, input.complaintId);
  if (!verification) throw new Error("Verification record could not be prepared.");
  await platformPrisma.$executeRaw`
    UPDATE ComplaintVerification
    SET status = ${input.status},
        verificationType = ${input.verificationType ?? null},
        findings = ${findings || null},
        verifiedById = ${user.id},
        verifiedAt = ${input.status === "IN_PROGRESS" ? null : new Date()},
        updatedAt = NOW(3)
    WHERE tenantId = ${user.tenantId} AND complaintId = ${input.complaintId}
  `;
  await activity({ tenantId: user.tenantId, complaintId: input.complaintId, actorId: user.id, eventType: "VERIFICATION_COMPLETED", message: `Complaint verification updated to ${input.status}.`, metadata: { status: input.status, verificationType: input.verificationType ?? null } });
  await audit({ tenantId: user.tenantId, actorId: user.id, action: "UPDATE_COMPLAINT_VERIFICATION", entityType: "Complaint", entityId: input.complaintId, metadata: { status: input.status, verificationType: input.verificationType ?? null } });
}

export async function assertComplaintEnforcementAllowed(tenantId: string, complaintId: string) {
  const verification = await evaluateComplaintVerificationRequirement(tenantId, complaintId);
  if (verification && Boolean(verification.required) && Boolean(verification.blocksEnforcement) && verification.status !== "PASSED") {
    throw new Error("Independent verification is required before this enforcement action can proceed.");
  }
  return verification;
}

export async function promoteComplaintToGrievance(user: EffectiveUser, complaintId: string) {
  await requireGrievancePermission(user, "TRIAGE_GRIEVANCE");
  const complaint = await platformPrisma.complaint.findFirst({
    where: { tenantId: user.tenantId, id: complaintId },
    select: { id: true, category: { select: { requiresBoardReview: true } } },
  });
  if (!complaint) throw new Error("Complaint not found.");
  const verification = await evaluateComplaintVerificationRequirement(user.tenantId, complaint.id);
  const status = verification && Boolean(verification.required)
    ? verification.status === "PASSED" ? "VERIFIED" : "VERIFICATION_REQUIRED"
    : "ASSESSMENT";
  const id = randomUUID();
  await platformPrisma.$executeRaw`
    INSERT IGNORE INTO GrievanceCase
      (id, tenantId, complaintId, status, boardReviewRequired, createdById, createdAt, updatedAt)
    VALUES
      (${id}, ${user.tenantId}, ${complaint.id}, ${status}, ${Boolean(complaint.category?.requiresBoardReview)}, ${user.id}, NOW(3), NOW(3))
  `;
  const rows = await platformPrisma.$queryRaw<GrievanceRow[]>`
    SELECT id, tenantId, complaintId, status, boardReviewRequired
    FROM GrievanceCase
    WHERE tenantId = ${user.tenantId} AND complaintId = ${complaint.id}
    LIMIT 1
  `;
  const grievance = rows[0];
  if (!grievance) throw new Error("Grievance case could not be created.");
  await activity({ tenantId: user.tenantId, complaintId: complaint.id, grievanceCaseId: grievance.id, actorId: user.id, eventType: "GRIEVANCE_CREATED", message: "Complaint promoted to a formal grievance case.", metadata: { status: grievance.status, boardReviewRequired: Boolean(grievance.boardReviewRequired) } });
  await audit({ tenantId: user.tenantId, actorId: user.id, action: "PROMOTE_COMPLAINT_TO_GRIEVANCE", entityType: "GrievanceCase", entityId: grievance.id, metadata: { complaintId: complaint.id, status: grievance.status, boardReviewRequired: Boolean(grievance.boardReviewRequired) } });
  return grievance;
}

export async function appointGrievanceCommitteeMember(user: EffectiveUser, input: {
  userId: string;
  position: GrievanceCommitteePosition;
  permissions: GrievancePermission[];
  startsAt: Date;
  endsAt?: Date | null;
}) {
  if (!hasAdminAuthority(user)) throw new Error("Only an authorized HOA administrator may appoint grievance committee members.");
  if (!positions.has(input.position)) throw new Error("Choose a valid grievance committee position.");
  const member = await platformPrisma.user.findFirst({
    where: { tenantId: user.tenantId, id: input.userId, active: true },
    select: { id: true },
  });
  if (!member) throw new Error("Committee member was not found in this HOA.");
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) throw new Error("Enter a valid committee appointment start date.");
  if (input.endsAt && input.endsAt <= input.startsAt) throw new Error("Committee appointment end date must be after its start date.");
  const permissions = normalizePermissions(input.permissions);
  const id = randomUUID();
  await platformPrisma.$executeRaw`
    INSERT INTO GrievanceCommitteeMembership
      (id, tenantId, userId, position, permissions, startsAt, endsAt, active, appointedById, createdAt, updatedAt)
    VALUES
      (${id}, ${user.tenantId}, ${member.id}, ${input.position}, ${JSON.stringify(permissions)}, ${input.startsAt}, ${input.endsAt ?? null}, true, ${user.id}, NOW(3), NOW(3))
  `;
  await audit({ tenantId: user.tenantId, actorId: user.id, action: "APPOINT_GRIEVANCE_COMMITTEE_MEMBER", entityType: "GrievanceCommitteeMembership", entityId: id, metadata: { memberUserId: member.id, position: input.position, permissions } });
  return { id };
}

export async function endGrievanceCommitteeMembership(user: EffectiveUser, membershipId: string, endedAt = new Date()) {
  if (!hasAdminAuthority(user)) throw new Error("Only an authorized HOA administrator may end grievance committee appointments.");
  const changed = await platformPrisma.$executeRaw`
    UPDATE GrievanceCommitteeMembership
    SET active = false, endsAt = ${endedAt}, updatedAt = NOW(3)
    WHERE tenantId = ${user.tenantId} AND id = ${membershipId} AND active = true
  `;
  if (Number(changed) !== 1) throw new Error("Active grievance committee membership was not found.");
  await audit({ tenantId: user.tenantId, actorId: user.id, action: "END_GRIEVANCE_COMMITTEE_MEMBERSHIP", entityType: "GrievanceCommitteeMembership", entityId: membershipId });
}

export async function createGrievanceDeadline(user: EffectiveUser, input: {
  grievanceCaseId: string;
  deadlineType: GrievanceDeadlineType;
  startsAt: Date;
  dueAt: Date;
  policySource?: string | null;
}) {
  await requireGrievancePermission(user, "TRIAGE_GRIEVANCE");
  if (!deadlineTypes.has(input.deadlineType)) throw new Error("Choose a valid grievance deadline type.");
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime()) || !(input.dueAt instanceof Date) || Number.isNaN(input.dueAt.getTime())) throw new Error("Enter valid grievance deadline dates.");
  if (input.dueAt <= input.startsAt) throw new Error("Grievance deadline must be after its start time.");
  const cases = await platformPrisma.$queryRaw<Array<{ id: string; complaintId: string }>>`
    SELECT id, complaintId
    FROM GrievanceCase
    WHERE tenantId = ${user.tenantId} AND id = ${input.grievanceCaseId}
    LIMIT 1
  `;
  const grievance = cases[0];
  if (!grievance) throw new Error("Grievance case not found.");
  const id = randomUUID();
  await platformPrisma.$executeRaw`
    INSERT INTO GrievanceDeadline
      (id, tenantId, grievanceCaseId, deadlineType, status, startsAt, dueAt, policySource, createdById, createdAt, updatedAt)
    VALUES
      (${id}, ${user.tenantId}, ${grievance.id}, ${input.deadlineType}, 'OPEN', ${input.startsAt}, ${input.dueAt}, ${String(input.policySource || "").trim().slice(0, 4000) || null}, ${user.id}, NOW(3), NOW(3))
  `;
  await activity({ tenantId: user.tenantId, complaintId: grievance.complaintId, grievanceCaseId: grievance.id, actorId: user.id, eventType: "DEADLINE_CREATED", message: `Grievance deadline ${input.deadlineType} created.`, metadata: { deadlineId: id, dueAt: input.dueAt.toISOString() } });
  await audit({ tenantId: user.tenantId, actorId: user.id, action: "CREATE_GRIEVANCE_DEADLINE", entityType: "GrievanceDeadline", entityId: id, metadata: { grievanceCaseId: grievance.id, deadlineType: input.deadlineType, dueAt: input.dueAt.toISOString(), policySourceProvided: Boolean(input.policySource) } });
  return { id };
}

export async function pauseGrievanceOperationalSla(user: EffectiveUser, grievanceCaseId: string, reason: string) {
  await requireGrievancePermission(user, "TRIAGE_GRIEVANCE");
  const pauseReason = String(reason || "").trim().slice(0, 2000);
  if (pauseReason.length < 10) throw new Error("Enter the approved policy/process reason for pausing the operational SLA.");
  const cases = await platformPrisma.$queryRaw<Array<{ id: string; complaintId: string }>>`
    SELECT id, complaintId
    FROM GrievanceCase
    WHERE tenantId = ${user.tenantId} AND id = ${grievanceCaseId}
    LIMIT 1
  `;
  const grievance = cases[0];
  if (!grievance) throw new Error("Grievance case not found.");
  await platformPrisma.$executeRaw`
    UPDATE GrievanceCase
    SET operationalSlaPausedAt = NOW(3), operationalSlaPauseReason = ${pauseReason}, updatedAt = NOW(3)
    WHERE tenantId = ${user.tenantId} AND id = ${grievance.id}
  `;
  await activity({ tenantId: user.tenantId, complaintId: grievance.complaintId, grievanceCaseId: grievance.id, actorId: user.id, eventType: "OPERATIONAL_SLA_PAUSED", message: "Complaint operational SLA pause recorded separately from the grievance process deadline." });
  await audit({ tenantId: user.tenantId, actorId: user.id, action: "PAUSE_GRIEVANCE_OPERATIONAL_SLA", entityType: "GrievanceCase", entityId: grievance.id, metadata: { reasonRecorded: true } });
}
