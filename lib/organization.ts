import "server-only";

import type { OrganizationOfficer, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

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

export async function getActiveOrganizationOfficers(tenantId: string, at = new Date()) {
  return prisma.organizationOfficer.findMany({
    where: {
      tenantId,
      active: true,
      archivedAt: null,
      effectiveDate: { lte: at },
      OR: [{ endDate: null }, { endDate: { gte: at } }],
    },
    orderBy: [{ displayOrder: "asc" }, { position: "asc" }, { fullName: "asc" }],
  });
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

export function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
