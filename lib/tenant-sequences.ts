import "server-only";

import { prisma } from "@/lib/db";

export async function nextTenantSequence(tenantId: string, scope: string, date = new Date()) {
  const year = date.getFullYear();
  return prisma.$transaction(async (tx) => {
    await tx.tenantSequence.upsert({
      where: { tenantId_scope_year: { tenantId, scope, year } },
      update: { nextValue: { increment: 1 } },
      create: { tenantId, scope, year, nextValue: 2 },
    });
    const sequence = await tx.tenantSequence.findUniqueOrThrow({ where: { tenantId_scope_year: { tenantId, scope, year } } });
    return { year, value: sequence.nextValue - 1, formatted: `${scope}-${year}-${String(sequence.nextValue - 1).padStart(6, "0")}` };
  });
}
