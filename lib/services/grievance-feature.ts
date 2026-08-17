import "server-only";

import { platformPrisma } from "@/lib/db";

type FoundationSettingRow = {
  foundationEnabled: number | boolean;
};

export async function isGrievanceFoundationEnabled(tenantId: string) {
  const rows = await platformPrisma.$queryRaw<FoundationSettingRow[]>`
    SELECT foundationEnabled
    FROM GrievanceSetting
    WHERE tenantId = ${tenantId}
    LIMIT 1
  `;
  return rows[0] ? Boolean(rows[0].foundationEnabled) : true;
}

export async function assertGrievanceFoundationEnabled(tenantId: string) {
  if (!await isGrievanceFoundationEnabled(tenantId)) {
    throw new Error("The grievance foundation is currently disabled for this HOA.");
  }
}
