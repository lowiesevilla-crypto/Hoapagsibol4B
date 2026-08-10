import { Prisma } from "@prisma/client";
import { Permission } from "@/lib/authorization/permissions";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import { repositoryDefaultCategories } from "@/lib/document-repository/constants";
import { prisma } from "@/lib/db";

export type RepositoryCategoryInitializationResult = {
  created: number;
  existing: number;
};

/**
 * Creates HOAHub's default repository taxonomy for the active tenant.
 *
 * Existing tenant categories are never renamed or overwritten. Missing defaults
 * are created individually so first-use initialization remains compatible with
 * production MySQL/MariaDB variants while duplicate races remain harmless.
 */
export async function ensureRepositoryDefaultCategories(): Promise<RepositoryCategoryInitializationResult> {
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES);
  const existingRows = await prisma.repositoryDocumentCategory.findMany({
    where: { tenantId: context.tenantId },
    select: { code: true },
  });
  const existingCodes = new Set(existingRows.map((category) => category.code));
  let created = 0;
  let existing = existingCodes.size;

  for (const category of repositoryDefaultCategories) {
    if (existingCodes.has(category.code)) continue;
    try {
      await prisma.repositoryDocumentCategory.create({
        data: {
          tenantId: context.tenantId,
          code: category.code,
          name: category.name,
          categoryGroup: category.group,
          active: true,
          sortOrder: category.sortOrder,
          systemDefault: true,
          governanceControlled: category.governed,
        },
      });
      created += 1;
      existingCodes.add(category.code);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        existing += 1;
        existingCodes.add(category.code);
        continue;
      }
      throw error;
    }
  }

  return {
    created,
    existing: Math.max(existing, repositoryDefaultCategories.length - created),
  };
}
