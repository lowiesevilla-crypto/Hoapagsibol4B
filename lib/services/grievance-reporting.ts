import "server-only";

import { ComplaintPrivacyMode, ComplaintStatus, Prisma, type Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { assertGrievanceActorEligible } from "@/lib/services/grievance-authorization";
import { requireGrievancePermission } from "@/lib/services/grievance-foundation";

type EffectiveUser = {
  id: string;
  tenantId: string;
  roles: Role[];
  role?: Role;
  name?: string;
};

export type GrievanceReportFilters = {
  q?: string;
  complaintStatus?: string;
  grievanceStatus?: string;
  verificationStatus?: string;
  privacyMode?: string;
  categoryId?: string;
  assignedToId?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  page?: number;
  pageSize?: number;
  foundationOnly?: boolean;
};

export type GrievanceReportRow = {
  complaintId: string;
  complaintNumber: string;
  publicReference: string;
  title: string;
  privacyMode: string;
  complaintStatus: string;
  categoryId: string | null;
  categoryName: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  submittedAt: Date;
  updatedAt: Date;
  grievanceCaseId: string | null;
  grievanceStatus: string | null;
  boardReviewRequired: number | boolean | null;
  verificationStatus: string | null;
  verificationRequired: number | boolean | null;
  blocksEnforcement: number | boolean | null;
};

export type GrievanceQueueRow = {
  id: string;
  complaintNumber: string;
  publicReference: string;
  title: string;
  privacyMode: ComplaintPrivacyMode;
  status: ComplaintStatus;
  categoryName: string | null;
  submittedAt: Date;
  assignedToName: string | null;
  messageCount: bigint | number;
  attachmentCount: bigint | number;
  grievanceStatus: string | null;
  verificationStatus: string | null;
  verificationRequired: number | boolean | null;
  blocksEnforcement: number | boolean | null;
};

export type GrievanceReportResult = {
  rows: GrievanceReportRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type CountRow = { total: bigint | number };

function safeText(value: string | undefined, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function whereSql(user: EffectiveUser, filters: GrievanceReportFilters) {
  const clauses: Prisma.Sql[] = [Prisma.sql`c.tenantId = ${user.tenantId}`];
  const q = safeText(filters.q);
  if (q) {
    const like = `%${q}%`;
    clauses.push(Prisma.sql`(
      c.complaintNumber LIKE ${like}
      OR c.publicReference LIKE ${like}
      OR c.title LIKE ${like}
      OR COALESCE(cat.name, '') LIKE ${like}
    )`);
  }
  if (filters.complaintStatus) clauses.push(Prisma.sql`c.status = ${safeText(filters.complaintStatus, 60)}`);
  if (filters.grievanceStatus) clauses.push(Prisma.sql`g.status = ${safeText(filters.grievanceStatus, 60)}`);
  if (filters.verificationStatus) {
    if (filters.verificationStatus === "NOT_EVALUATED") clauses.push(Prisma.sql`v.id IS NULL`);
    else clauses.push(Prisma.sql`v.status = ${safeText(filters.verificationStatus, 60)}`);
  }
  if (filters.privacyMode) clauses.push(Prisma.sql`c.privacyMode = ${safeText(filters.privacyMode, 30)}`);
  if (filters.categoryId) clauses.push(Prisma.sql`c.categoryId = ${safeText(filters.categoryId, 191)}`);
  if (filters.assignedToId) clauses.push(Prisma.sql`c.assignedToId = ${safeText(filters.assignedToId, 191)}`);
  if (filters.dateFrom) clauses.push(Prisma.sql`c.submittedAt >= ${filters.dateFrom}`);
  if (filters.dateTo) clauses.push(Prisma.sql`c.submittedAt <= ${filters.dateTo}`);
  if (filters.foundationOnly) clauses.push(Prisma.sql`(g.id IS NOT NULL OR v.id IS NOT NULL)`);
  return Prisma.join(clauses, " AND ");
}

export async function getGrievanceReport(user: EffectiveUser, filters: GrievanceReportFilters = {}): Promise<GrievanceReportResult> {
  assertGrievanceActorEligible(user);
  await requireGrievancePermission(user, "VIEW_GRIEVANCE");
  const pageSize = Math.max(1, Math.min(100, Math.trunc(filters.pageSize || 25)));
  const page = Math.max(1, Math.trunc(filters.page || 1));
  const offset = (page - 1) * pageSize;
  const where = whereSql(user, filters);

  const [rows, counts] = await Promise.all([
    platformPrisma.$queryRaw<GrievanceReportRow[]>(Prisma.sql`
      SELECT
        c.id AS complaintId,
        c.complaintNumber,
        c.publicReference,
        c.title,
        c.privacyMode,
        c.status AS complaintStatus,
        c.categoryId,
        cat.name AS categoryName,
        c.assignedToId,
        assignee.name AS assignedToName,
        c.submittedAt,
        c.updatedAt,
        g.id AS grievanceCaseId,
        g.status AS grievanceStatus,
        g.boardReviewRequired,
        v.status AS verificationStatus,
        v.required AS verificationRequired,
        v.blocksEnforcement
      FROM Complaint c
      LEFT JOIN ComplaintCategory cat
        ON cat.tenantId = c.tenantId AND cat.id = c.categoryId
      LEFT JOIN User assignee
        ON assignee.tenantId = c.tenantId AND assignee.id = c.assignedToId
      LEFT JOIN GrievanceCase g
        ON g.tenantId = c.tenantId AND g.complaintId = c.id
      LEFT JOIN ComplaintVerification v
        ON v.tenantId = c.tenantId AND v.complaintId = c.id
      WHERE ${where}
      ORDER BY c.updatedAt DESC, c.id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `),
    platformPrisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM Complaint c
      LEFT JOIN ComplaintCategory cat
        ON cat.tenantId = c.tenantId AND cat.id = c.categoryId
      LEFT JOIN GrievanceCase g
        ON g.tenantId = c.tenantId AND g.complaintId = c.id
      LEFT JOIN ComplaintVerification v
        ON v.tenantId = c.tenantId AND v.complaintId = c.id
      WHERE ${where}
    `),
  ]);

  const total = Number(counts[0]?.total || 0);
  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getGrievanceComplaintQueue(user: EffectiveUser, filters: GrievanceReportFilters = {}) {
  assertGrievanceActorEligible(user);
  await requireGrievancePermission(user, "VIEW_GRIEVANCE");
  const where = whereSql(user, filters);
  return platformPrisma.$queryRaw<GrievanceQueueRow[]>(Prisma.sql`
    SELECT
      c.id,
      c.complaintNumber,
      c.publicReference,
      c.title,
      c.privacyMode,
      c.status,
      cat.name AS categoryName,
      c.submittedAt,
      assignee.name AS assignedToName,
      (SELECT COUNT(*) FROM ComplaintMessage m WHERE m.tenantId = c.tenantId AND m.complaintId = c.id) AS messageCount,
      (SELECT COUNT(*) FROM ComplaintAttachment a WHERE a.tenantId = c.tenantId AND a.complaintId = c.id) AS attachmentCount,
      g.status AS grievanceStatus,
      v.status AS verificationStatus,
      v.required AS verificationRequired,
      v.blocksEnforcement
    FROM Complaint c
    LEFT JOIN ComplaintCategory cat
      ON cat.tenantId = c.tenantId AND cat.id = c.categoryId
    LEFT JOIN User assignee
      ON assignee.tenantId = c.tenantId AND assignee.id = c.assignedToId
    LEFT JOIN GrievanceCase g
      ON g.tenantId = c.tenantId AND g.complaintId = c.id
    LEFT JOIN ComplaintVerification v
      ON v.tenantId = c.tenantId AND v.complaintId = c.id
    WHERE ${where}
    ORDER BY c.submittedAt DESC, c.id DESC
    LIMIT 100
  `);
}

export async function getGrievanceMetadataForComplaints(user: EffectiveUser, complaintIds: string[]) {
  assertGrievanceActorEligible(user);
  await requireGrievancePermission(user, "VIEW_GRIEVANCE");
  const ids = [...new Set(complaintIds.map((id) => safeText(id, 191)).filter(Boolean))].slice(0, 200);
  if (ids.length === 0) return [] as Array<Pick<GrievanceReportRow, "complaintId" | "grievanceCaseId" | "grievanceStatus" | "verificationStatus" | "verificationRequired" | "blocksEnforcement">>;
  return platformPrisma.$queryRaw<Array<Pick<GrievanceReportRow, "complaintId" | "grievanceCaseId" | "grievanceStatus" | "verificationStatus" | "verificationRequired" | "blocksEnforcement">>>(Prisma.sql`
    SELECT
      c.id AS complaintId,
      g.id AS grievanceCaseId,
      g.status AS grievanceStatus,
      v.status AS verificationStatus,
      v.required AS verificationRequired,
      v.blocksEnforcement
    FROM Complaint c
    LEFT JOIN GrievanceCase g
      ON g.tenantId = c.tenantId AND g.complaintId = c.id
    LEFT JOIN ComplaintVerification v
      ON v.tenantId = c.tenantId AND v.complaintId = c.id
    WHERE c.tenantId = ${user.tenantId}
      AND c.id IN (${Prisma.join(ids)})
  `);
}
