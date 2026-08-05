import { Role } from "@prisma/client";

export const tenantA = {
  id: "tenant-a",
  admin: { tenantId: "tenant-a", role: Role.HOA_ADMIN },
  billingManager: { tenantId: "tenant-a", role: Role.BILLING_MANAGER },
  homeowner: { tenantId: "tenant-a", role: Role.HOMEOWNER },
};

export const tenantB = {
  id: "tenant-b",
  admin: { tenantId: "tenant-b", role: Role.HOA_ADMIN },
  homeowner: { tenantId: "tenant-b", role: Role.HOMEOWNER },
};

export const platformAdmin = {
  tenantId: "platform",
  role: Role.PLATFORM_ADMIN,
};
