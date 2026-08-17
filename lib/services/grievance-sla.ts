import "server-only";

import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { requireGrievancePermission } from "@/lib/services/grievance-foundation";

type EffectiveUser = {
  id: string;
  tenantId: string;
  roles: Role[];
  role?: Role;
  name?: string;
};

export async function setGrievanceOperationalSlaPause(user: EffectiveUser, input: {
  complaintId: string;
  grievanceCaseId: string;
  paused: boolean;
  reason?: string | null;
}) {
  await requireGrievancePermission(user, "TRIAGE_GRIEVANCE");
  const reason = String(input.reason || "").trim().slice(0, 2000);
  if (input.paused && reason.length < 10) {
    throw new Error("Record the approved process/policy reason before pausing the operational SLA.");
  }

  const rows = await platformPrisma.$queryRaw<Array<{ id: string; operationalSlaPausedAt: Date | null }>>`
    SELECT id, operationalSlaPausedAt
    FROM GrievanceCase
    WHERE tenantId = ${user.tenantId}
      AND id = ${input.grievanceCaseId}
      AND complaintId = ${input.complaintId}
    LIMIT 1
  `;
  const grievance = rows[0];
  if (!grievance) throw new Error("Grievance case not found.");
  if (input.paused && grievance.operationalSlaPausedAt) throw new Error("Operational SLA is already paused for this grievance.");
  if (!input.paused && !grievance.operationalSlaPausedAt) throw new Error("Operational SLA is not currently paused.");

  const eventType = input.paused ? "OPERATIONAL_SLA_PAUSED" : "OPERATIONAL_SLA_RESUMED";
  const message = input.paused
    ? "Complaint operational SLA paused while a grievance process deadline is running."
    : "Complaint operational SLA resumed after the grievance process wait period.";

  await platformPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE GrievanceCase
      SET operationalSlaPausedAt = ${input.paused ? new Date() : null},
          operationalSlaPauseReason = ${input.paused ? reason : null},
          updatedAt = NOW(3)
      WHERE tenantId = ${user.tenantId}
        AND id = ${input.grievanceCaseId}
        AND complaintId = ${input.complaintId}
    `;
    await tx.$executeRaw`
      INSERT INTO ComplaintGrievanceActivity
        (id, tenantId, complaintId, grievanceCaseId, actorId, eventType, message, metadata, createdAt)
      VALUES
        (${randomUUID()}, ${user.tenantId}, ${input.complaintId}, ${input.grievanceCaseId}, ${user.id}, ${eventType}, ${message}, ${JSON.stringify({ paused: input.paused, reasonProvided: Boolean(reason) })}, NOW(3))
    `;
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "COMPLAINTS",
        action: input.paused ? "PAUSE_GRIEVANCE_OPERATIONAL_SLA" : "RESUME_GRIEVANCE_OPERATIONAL_SLA",
        entityType: "GrievanceCase",
        entityId: input.grievanceCaseId,
        metadata: { complaintId: input.complaintId, paused: input.paused, reasonProvided: Boolean(reason) },
      },
    });
  });
}
