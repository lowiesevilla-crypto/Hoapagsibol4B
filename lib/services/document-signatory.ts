import "server-only";

import type { OrganizationOfficer } from "@prisma/client";
import { platformPrisma } from "@/lib/db";

export type DocumentSignatoryIdentity = {
  tenantId: string;
  name: string;
  position: string;
};

export function isPresidentPosition(position: string) {
  const normalized = normalizePosition(position);
  if (!normalized || /\b(vice|past|former|assistant)\b/.test(normalized)) return false;
  return normalized === "president"
    || normalized === "hoa president"
    || normalized === "association president"
    || normalized === "homeowners association president"
    || normalized === "homeowner association president"
    || normalized.startsWith("president ");
}

export function selectDefaultDocumentPresident<T extends Pick<OrganizationOfficer, "position" | "displayOrder">>(officers: readonly T[]) {
  return [...officers]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .find((officer) => isPresidentPosition(officer.position)) ?? null;
}

export async function findDefaultDocumentPresident(tenantId: string, at = new Date()) {
  const officers = await platformPrisma.organizationOfficer.findMany({
    where: {
      tenantId,
      active: true,
      archivedAt: null,
      effectiveDate: { lte: at },
      OR: [{ endDate: null }, { endDate: { gte: at } }],
    },
    orderBy: [{ displayOrder: "asc" }, { fullName: "asc" }],
  });
  return selectDefaultDocumentPresident(officers);
}

export async function resolveDocumentSignatureAsset(identity: DocumentSignatoryIdentity, at = new Date()) {
  const name = identity.name.trim();
  const position = identity.position.trim();
  if (!identity.tenantId || !name || !position) return null;
  return platformPrisma.organizationOfficer.findFirst({
    where: {
      tenantId: identity.tenantId,
      fullName: name,
      position,
      active: true,
      archivedAt: null,
      effectiveDate: { lte: at },
      OR: [{ endDate: null }, { endDate: { gte: at } }],
    },
    select: {
      id: true,
      fullName: true,
      position: true,
      signatureUrl: true,
    },
  });
}

function normalizePosition(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
