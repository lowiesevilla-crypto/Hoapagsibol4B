import "server-only";

import type { OrganizationOfficer, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withTenantContext } from "@/lib/tenant-context";

export type OfficerSnapshot = {
  id: string;
  fullName: string;
  position: string;
  committee: string | null;
  contactNumber: string | null;
  email: string | null;
  photoUrl: string | null;
  signatureUrl: string | null;
  displayOrder: number;
};

export type OfficerListSnapshot = {
  sourceTenantId: string;
  term: string | null;
  officers: Array<Pick<OfficerSnapshot, "id" | "fullName" | "position" | "displayOrder">>;
};

export async function getActiveOrganizationOfficers(tenantId: string, at = new Date()) {
  return withTenantContext(tenantId, async () => await prisma.organizationOfficer.findMany({
    where: {
      tenantId,
      active: true,
      archivedAt: null,
      effectiveDate: { lte: at },
      OR: [{ endDate: null }, { endDate: { gte: at } }],
    },
    orderBy: [{ displayOrder: "asc" }, { position: "asc" }, { fullName: "asc" }],
  }));
}

export function officerSnapshot(officer: OrganizationOfficer): OfficerSnapshot {
  return {
    id: officer.id,
    fullName: officer.fullName,
    position: officer.position,
    committee: officer.committee,
    contactNumber: officer.contactNumber,
    email: officer.email,
    photoUrl: officer.photoUrl,
    signatureUrl: officer.signatureUrl,
    displayOrder: officer.displayOrder,
  };
}

export function organizationOfficerTerm(officers: Array<Pick<OrganizationOfficer, "effectiveDate" | "endDate">>, at = new Date()) {
  if (!officers.length) return null;
  const startYear = Math.min(...officers.map((officer) => officer.effectiveDate.getUTCFullYear()));
  const endYears = officers.map((officer) => officer.endDate?.getUTCFullYear()).filter((year): year is number => Number.isInteger(year));
  const endYear = endYears.length ? Math.max(...endYears) : Math.max(startYear + 1, at.getUTCFullYear());
  return `CY ${startYear}-${endYear}`;
}

export function officerListSnapshot(tenantId: string, officers: OrganizationOfficer[], at = new Date()): OfficerListSnapshot {
  return {
    sourceTenantId: tenantId,
    term: organizationOfficerTerm(officers, at),
    officers: officers.map((officer) => ({ id: officer.id, fullName: officer.fullName, position: officer.position, displayOrder: officer.displayOrder })),
  };
}

export function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
