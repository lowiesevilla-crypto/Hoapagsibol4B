import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import {
  assertComplaintEnforcementAllowed,
  requireGrievancePermission,
  type GrievancePermission,
} from "@/lib/services/grievance-foundation";

type EffectiveUser = {
  id: string;
  tenantId: string;
  roles: Role[];
  role?: Role;
  name?: string;
};

export type GrievanceCaseStatus =
  | "ASSESSMENT"
  | "VERIFICATION_REQUIRED"
  | "VERIFIED"
  | "READY_FOR_FORMAL_PROCESS"
  | "CLOSED_NO_ACTION"
  | "CLOSED_UNSUBSTANTIATED";

export type GrievanceDeadlineStatus = "OPEN" | "PAUSED" | "COMPLETED" | "CANCELLED";

export type ComplaintSubjectSummary = {
  id: string;
  subjectType: "HOMEOWNER" | "PROPERTY" | "VEHICLE" | "COMMON_AREA" | "UNKNOWN";
  homeownerId: string | null;
  vehicleId: string | null;
  displayLabel: string | null;
  phaseSnapshot: string | null;
  blockSnapshot: string | null;
  lotSnapshot: string | null;
  addressSnapshot: string | null;
  createdAt: Date;
};

export type ComplaintVerificationSummary = {
  id: string;
  required: number | boolean;
  blocksEnforcement: number | boolean;
  status: "NOT_REQUIRED" | "PENDING" | "IN_PROGRESS" | "PASSED" | "FAILED" | "INSUFFICIENT";
  verificationType: string | null;
  findings: string | null;
  verifiedById: string | null;
  verifiedByName: string | null;
  verifiedAt: Date | null;
  updatedAt: Date;
};

export type GrievanceDeadlineSummary = {
  id: string;
  deadlineType: string;
  status: GrievanceDeadlineStatus;
  startsAt: Date;
  dueAt: Date;
  completedAt: Date | null;
  pausedAt: Date | null;
  pauseReason: string | null;
  policySource: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GrievanceCaseSummary = {
  id: string;
  status: GrievanceCaseStatus;
  boardReviewRequired: number | boolean;
  operationalSlaPausedAt: Date | null;
  operationalSlaPauseReason: string | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GrievanceActivitySummary = {
  id: string;
  eventType: string;
  message: string;
  actorName: string | null;
  createdAt: Date;
};

export type ComplaintGrievanceFoundation = {
  subjects: ComplaintSubjectSummary[];
  verification: ComplaintVerificationSummary | null;
  grievanceCase: GrievanceCaseSummary | null;
  deadlines: GrievanceDeadlineSummary[];
  activities: GrievanceActivitySummary[];
};

export type GrievanceCommitteeMembershipSummary = {
  id: string;
  userId: string;
  userName: string;
  position: "CHAIR" | "MEMBER" | "SECRETARY" | "MEDIATOR";
  permissions: GrievancePermission[];
  startsAt: Date;
  endsAt: Date | null;
  active: number | boolean;
  appointedByName: string | null;
  createdAt: Date;
};

export type ComplaintVerificationPolicySummary = {
  id: string;
  policyKey: string;
  categoryId: string | null;
  categoryName: string | null;
  privacyMode: "NAMED" | "CONFIDENTIAL" | "ANONYMOUS" | null;
  verificationRequired: number | boolean;
  blocksEnforcement: number | boolean;
  active: number | boolean;
  updatedAt: Date;
};

export type GrievanceSettingSummary = {
  foundationEnabled: boolean;
  anonymousMessagingEnabled: boolean;
  anonymousSessionMinutes: number;
};

const allowedTransitions: Record<GrievanceCaseStatus, GrievanceCaseStatus[]> = {
  ASSESSMENT: ["VERIFICATION_REQUIRED", "VERIFIED", "READY_FOR_FORMAL_PROCESS", "CLOSED_NO_ACTION", "CLOSED_UNSUBSTANTIATED"],
  VERIFICATION_REQUIRED: ["VERIFIED", "CLOSED_NO_ACTION", "CLOSED_UNSUBSTANTIATED"],
  VERIFIED: ["READY_FOR_FORMAL_PROCESS", "CLOSED_NO_ACTION", "CLOSED_UNSUBSTANTIATED"],
  READY_FOR_FORMAL_PROCESS: ["VERIFIED", "CLOSED_NO_ACTION", "CLOSED_UNSUBSTANTIATED"],
  CLOSED_NO_ACTION: ["ASSESSMENT"],
  CLOSED_UNSUBSTANTIATED: ["ASSESSMENT"],
};

const grievanceStatuses = new Set<GrievanceCaseStatus>(Object.keys(allowedTransitions) as GrievanceCaseStatus[]);
const deadlineStatuses = new Set<GrievanceDeadlineStatus>(["OPEN", "PAUSED", "COMPLETED", "CANCELLED"]);
const permissionSet = new Set<GrievancePermission>([
  "VIEW_GRIEVANCE",
  "TRIAGE_GRIEVANCE",
  "VERIFY_GRIEVANCE",
  "CONDUCT_MEDIATION",
  "CONDUCT_HEARING",
  "RECORD_MINUTES",
  "VOTE_GRIEVANCE",
  "REVEAL_CONFIDENTIAL_IDENTITY",
  "APPROVE_ENFORCEMENT",
]);

function parsePermissions(value: unknown): GrievancePermission[] {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(candidate)) return [];
  return [...new Set(candidate.map(String).filter((item): item is GrievancePermission => permissionSet.has(item as GrievancePermission)))];
}

async function writeAudit(input: {
  tenantId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}) {
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

async function addActivity(input: {
  tenantId: string;
  complaintId: string;
  grievanceCaseId?: string | null;
  actorId: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  await platformPrisma.$executeRaw`
    INSERT INTO ComplaintGrievanceActivity
      (id, tenantId, complaintId, grievanceCaseId, actorId, eventType, message, metadata, createdAt)
    VALUES
      (${randomUUID()}, ${input.tenantId}, ${input.complaintId}, ${input.grievanceCaseId ?? null}, ${input.actorId}, ${input.eventType}, ${input.message}, ${input.metadata ? JSON.stringify(input.metadata) : null}, NOW(3))
  `;
}

async function requireTenantComplaint(user: EffectiveUser, complaintId: string) {
  const complaint = await platformPrisma.complaint.findFirst({
    where: { tenantId: user.tenantId, id: complaintId },
    select: { id: true },
  });
  if (!complaint) throw new Error("Complaint not found.");
  return complaint;
}

export function allowedGrievanceTransitions(status: GrievanceCaseStatus) {
  return allowedTransitions[status] || [];
}

export async function getComplaintGrievanceFoundation(user: EffectiveUser, complaintId: string): Promise<ComplaintGrievanceFoundation> {
  await requireGrievancePermission(user, "VIEW_GRIEVANCE");
  await requireTenantComplaint(user, complaintId);

  const [subjects, verificationRows, grievanceRows, activities] = await Promise.all([
    platformPrisma.$queryRaw<ComplaintSubjectSummary[]>`
      SELECT id, subjectType, homeownerId, vehicleId, displayLabel, phaseSnapshot, blockSnapshot, lotSnapshot, addressSnapshot, createdAt
      FROM ComplaintSubject
      WHERE tenantId = ${user.tenantId} AND complaintId = ${complaintId}
      ORDER BY createdAt ASC, id ASC
    `,
    platformPrisma.$queryRaw<ComplaintVerificationSummary[]>`
      SELECT v.id, v.required, v.blocksEnforcement, v.status, v.verificationType, v.findings,
             v.verifiedById, u.name AS verifiedByName, v.verifiedAt, v.updatedAt
      FROM ComplaintVerification v
      LEFT JOIN User u ON u.tenantId = v.tenantId AND u.id = v.verifiedById
      WHERE v.tenantId = ${user.tenantId} AND v.complaintId = ${complaintId}
      LIMIT 1
    `,
    platformPrisma.$queryRaw<GrievanceCaseSummary[]>`
      SELECT id, status, boardReviewRequired, operationalSlaPausedAt, operationalSlaPauseReason, closedAt, createdAt, updatedAt
      FROM GrievanceCase
      WHERE tenantId = ${user.tenantId} AND complaintId = ${complaintId}
      LIMIT 1
    `,
    platformPrisma.$queryRaw<GrievanceActivitySummary[]>`
      SELECT a.id, a.eventType, a.message, u.name AS actorName, a.createdAt
      FROM ComplaintGrievanceActivity a
      LEFT JOIN User u ON u.tenantId = a.tenantId AND u.id = a.actorId
      WHERE a.tenantId = ${user.tenantId} AND a.complaintId = ${complaintId}
      ORDER BY a.createdAt DESC, a.id DESC
      LIMIT 100
    `,
  ]);

  const grievanceCase = grievanceRows[0] ?? null;
  const deadlines = grievanceCase
    ? await platformPrisma.$queryRaw<GrievanceDeadlineSummary[]>`
        SELECT id, deadlineType, status, startsAt, dueAt, completedAt, pausedAt, pauseReason, policySource, createdAt, updatedAt
        FROM GrievanceDeadline
        WHERE tenantId = ${user.tenantId} AND grievanceCaseId = ${grievanceCase.id}
        ORDER BY dueAt ASC, id ASC
      `
    : [];

  return {
    subjects,
    verification: verificationRows[0] ?? null,
    grievanceCase,
    deadlines,
    activities,
  };
}

export async function listGrievanceCommitteeMemberships(user: EffectiveUser) {
  await requireGrievancePermission(user, "VIEW_GRIEVANCE");
  const rows = await platformPrisma.$queryRaw<Array<Omit<GrievanceCommitteeMembershipSummary, "permissions"> & { permissions: unknown }>>`
    SELECT m.id, m.userId, u.name AS userName, m.position, m.permissions, m.startsAt, m.endsAt,
           m.active, a.name AS appointedByName, m.createdAt
    FROM GrievanceCommitteeMembership m
    INNER JOIN User u ON u.tenantId = m.tenantId AND u.id = m.userId
    LEFT JOIN User a ON a.tenantId = m.tenantId AND a.id = m.appointedById
    WHERE m.tenantId = ${user.tenantId}
    ORDER BY m.active DESC, m.startsAt DESC, u.name ASC
  `;
  return rows.map((row) => ({ ...row, permissions: parsePermissions(row.permissions) }));
}

export async function listComplaintVerificationPolicies(user: EffectiveUser) {
  await requireGrievancePermission(user, "VIEW_GRIEVANCE");
  return platformPrisma.$queryRaw<ComplaintVerificationPolicySummary[]>`
    SELECT p.id, p.policyKey, p.categoryId, c.name AS categoryName, p.privacyMode,
           p.verificationRequired, p.blocksEnforcement, p.active, p.updatedAt
    FROM ComplaintVerificationPolicy p
    LEFT JOIN ComplaintCategory c ON c.tenantId = p.tenantId AND c.id = p.categoryId
    WHERE p.tenantId = ${user.tenantId}
    ORDER BY p.active DESC, p.policyKey ASC
  `;
}

export async function getGrievanceSetting(user: EffectiveUser): Promise<GrievanceSettingSummary> {
  await requireGrievancePermission(user, "VIEW_GRIEVANCE");
  const rows = await platformPrisma.$queryRaw<Array<{ foundationEnabled: number | boolean; anonymousMessagingEnabled: number | boolean; anonymousSessionMinutes: number }>>`
    SELECT foundationEnabled, anonymousMessagingEnabled, anonymousSessionMinutes
    FROM GrievanceSetting
    WHERE tenantId = ${user.tenantId}
    LIMIT 1
  `;
  const row = rows[0];
  return {
    foundationEnabled: row ? Boolean(row.foundationEnabled) : true,
    anonymousMessagingEnabled: row ? Boolean(row.anonymousMessagingEnabled) : true,
    anonymousSessionMinutes: Math.max(5, Math.min(120, Number(row?.anonymousSessionMinutes || 30))),
  };
}

export async function saveGrievanceSetting(user: EffectiveUser, input: GrievanceSettingSummary) {
  await requireGrievancePermission(user, "TRIAGE_GRIEVANCE");
  const minutes = Math.max(5, Math.min(120, Math.trunc(Number(input.anonymousSessionMinutes) || 30)));
  const id = randomUUID();
  await platformPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO GrievanceSetting
        (id, tenantId, foundationEnabled, anonymousMessagingEnabled, anonymousSessionMinutes, updatedById, createdAt, updatedAt)
      VALUES
        (${id}, ${user.tenantId}, ${input.foundationEnabled}, ${input.anonymousMessagingEnabled}, ${minutes}, ${user.id}, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        foundationEnabled = VALUES(foundationEnabled),
        anonymousMessagingEnabled = VALUES(anonymousMessagingEnabled),
        anonymousSessionMinutes = VALUES(anonymousSessionMinutes),
        updatedById = VALUES(updatedById),
        updatedAt = NOW(3)
    `;
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "COMPLAINTS",
        action: "UPDATE_GRIEVANCE_SETTINGS",
        entityType: "GrievanceSetting",
        entityId: user.tenantId,
        metadata: {
          foundationEnabled: input.foundationEnabled,
          anonymousMessagingEnabled: input.anonymousMessagingEnabled,
          anonymousSessionMinutes: minutes,
        },
      },
    });
  });
}

export async function updateGrievanceCaseStatus(user: EffectiveUser, input: {
  complaintId: string;
  grievanceCaseId: string;
  status: GrievanceCaseStatus;
  note: string;
}) {
  await requireGrievancePermission(user, "TRIAGE_GRIEVANCE");
  await requireTenantComplaint(user, input.complaintId);
  if (!grievanceStatuses.has(input.status)) throw new Error("Choose a valid grievance status.");
  const rows = await platformPrisma.$queryRaw<Array<{ id: string; status: GrievanceCaseStatus }>>`
    SELECT id, status
    FROM GrievanceCase
    WHERE tenantId = ${user.tenantId}
      AND id = ${input.grievanceCaseId}
      AND complaintId = ${input.complaintId}
    LIMIT 1
  `;
  const grievance = rows[0];
  if (!grievance) throw new Error("Grievance case not found.");
  if (!allowedGrievanceTransitions(grievance.status).includes(input.status)) {
    throw new Error(`Grievance cannot move from ${grievance.status.replaceAll("_", " ")} to ${input.status.replaceAll("_", " ")}.`);
  }
  const note = String(input.note || "").trim().slice(0, 4000);
  if ((input.status === "CLOSED_NO_ACTION" || input.status === "CLOSED_UNSUBSTANTIATED") && note.length < 10) {
    throw new Error("Record a closure reason before closing the grievance.");
  }
  if (input.status === "READY_FOR_FORMAL_PROCESS") {
    await assertComplaintEnforcementAllowed(user.tenantId, input.complaintId);
  }

  await platformPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE GrievanceCase
      SET status = ${input.status},
          closedAt = ${input.status.startsWith("CLOSED_") ? new Date() : null},
          updatedAt = NOW(3)
      WHERE tenantId = ${user.tenantId}
        AND id = ${grievance.id}
        AND complaintId = ${input.complaintId}
    `;
    await tx.$executeRaw`
      INSERT INTO ComplaintGrievanceActivity
        (id, tenantId, complaintId, grievanceCaseId, actorId, eventType, message, metadata, createdAt)
      VALUES
        (${randomUUID()}, ${user.tenantId}, ${input.complaintId}, ${grievance.id}, ${user.id}, 'GRIEVANCE_STATUS_UPDATED', ${`Grievance status changed from ${grievance.status} to ${input.status}.`}, ${JSON.stringify({ from: grievance.status, to: input.status, note: note || null })}, NOW(3))
    `;
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "COMPLAINTS",
        action: "UPDATE_GRIEVANCE_STATUS",
        entityType: "GrievanceCase",
        entityId: grievance.id,
        metadata: { complaintId: input.complaintId, from: grievance.status, to: input.status, noteProvided: Boolean(note) },
      },
    });
  });
}

export async function updateGrievanceDeadlineStatus(user: EffectiveUser, input: {
  complaintId: string;
  grievanceCaseId: string;
  deadlineId: string;
  status: GrievanceDeadlineStatus;
  reason?: string | null;
}) {
  await requireGrievancePermission(user, "TRIAGE_GRIEVANCE");
  await requireTenantComplaint(user, input.complaintId);
  if (!deadlineStatuses.has(input.status)) throw new Error("Choose a valid deadline status.");
  const rows = await platformPrisma.$queryRaw<Array<{ id: string; status: GrievanceDeadlineStatus }>>`
    SELECT d.id, d.status
    FROM GrievanceDeadline d
    INNER JOIN GrievanceCase g ON g.tenantId = d.tenantId AND g.id = d.grievanceCaseId
    WHERE d.tenantId = ${user.tenantId}
      AND d.id = ${input.deadlineId}
      AND d.grievanceCaseId = ${input.grievanceCaseId}
      AND g.complaintId = ${input.complaintId}
    LIMIT 1
  `;
  const deadline = rows[0];
  if (!deadline) throw new Error("Grievance deadline not found.");
  const reason = String(input.reason || "").trim().slice(0, 2000);
  if (input.status === "PAUSED" && reason.length < 10) throw new Error("Record a reason before pausing a process deadline.");

  const now = new Date();
  await platformPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE GrievanceDeadline
      SET status = ${input.status},
          completedAt = ${input.status === "COMPLETED" ? now : null},
          pausedAt = ${input.status === "PAUSED" ? now : null},
          pauseReason = ${input.status === "PAUSED" ? reason : null},
          updatedById = ${user.id},
          updatedAt = NOW(3)
      WHERE tenantId = ${user.tenantId}
        AND id = ${deadline.id}
        AND grievanceCaseId = ${input.grievanceCaseId}
    `;
    await tx.$executeRaw`
      INSERT INTO ComplaintGrievanceActivity
        (id, tenantId, complaintId, grievanceCaseId, actorId, eventType, message, metadata, createdAt)
      VALUES
        (${randomUUID()}, ${user.tenantId}, ${input.complaintId}, ${input.grievanceCaseId}, ${user.id}, 'DEADLINE_UPDATED', ${`Process deadline changed from ${deadline.status} to ${input.status}.`}, ${JSON.stringify({ deadlineId: deadline.id, from: deadline.status, to: input.status, reasonProvided: Boolean(reason) })}, NOW(3))
    `;
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "COMPLAINTS",
        action: "UPDATE_GRIEVANCE_DEADLINE",
        entityType: "GrievanceDeadline",
        entityId: deadline.id,
        metadata: { grievanceCaseId: input.grievanceCaseId, complaintId: input.complaintId, from: deadline.status, to: input.status, reasonProvided: Boolean(reason) },
      },
    });
  });
}

export async function removeComplaintSubject(user: EffectiveUser, complaintId: string, subjectId: string) {
  await requireGrievancePermission(user, "TRIAGE_GRIEVANCE");
  await requireTenantComplaint(user, complaintId);
  const changed = await platformPrisma.$executeRaw`
    DELETE FROM ComplaintSubject
    WHERE tenantId = ${user.tenantId}
      AND complaintId = ${complaintId}
      AND id = ${subjectId}
  `;
  if (Number(changed) !== 1) throw new Error("Complaint subject not found.");
  await Promise.all([
    addActivity({ tenantId: user.tenantId, complaintId, actorId: user.id, eventType: "SUBJECT_UPDATED", message: "Structured complaint subject removed.", metadata: { subjectId } }),
    writeAudit({ tenantId: user.tenantId, actorId: user.id, action: "REMOVE_COMPLAINT_SUBJECT", entityType: "Complaint", entityId: complaintId, metadata: { subjectId } }),
  ]);
}
