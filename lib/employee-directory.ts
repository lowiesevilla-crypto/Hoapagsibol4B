import type { Prisma } from "@prisma/client";

export const employeeDirectoryPageSize = 25;

export function employeeDirectoryWhere(tenantId: string, query: string): Prisma.EmployeeProfileWhereInput {
  const q = query.trim();
  return {
    tenantId,
    ...(q ? {
      OR: [
        { employeeNumber: { contains: q } },
        { name: { contains: q } },
        { position: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
      ],
    } : {}),
  };
}
