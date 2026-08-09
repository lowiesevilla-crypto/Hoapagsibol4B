import { Permission } from "@/lib/authorization/permissions";
import { repositoryDefaultCategories } from "@/lib/document-repository/constants";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import { prisma } from "@/lib/db";

export type RepositoryCategoryInitializationResult = {
  created: number;
  existing: number;
};

/**
 * Creates HOAHub's default repository taxonomy for the active tenant.
 *
 * Existing tenant categories are never renamed or overwritten. This keeps the
 * operation idempotent and preserves tenant customizations while allowing new
 * system defaults to be introduced safely in future releases.
 */
export async function ensureRepositoryDefaultCategories(): Promise<RepositoryCategoryInitializationResult> {
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES);
  let created = 0;
  let existing = 0;

  for (const category of repositoryDefaultCategories) {
    const found = await prisma.repositoryDocumentCategory.findFirst({
      where: { tenantId: context.tenantId, code: category.code },
      select: { id: true },
    });

    if (found) {
      existing += 1;
      continue;
    }

    await prisma.repositoryDocumentCategory.create({
      data: {
        tenantId: context.tenantId,
        code: category.code,
        name: category.name,
        active: true,
        sortOrder: category.sortOrder,
        systemDefault: true,
        governanceControlled: category.governed,
      },
      select: { id: true },
    });
    created += 1;
  }

  return { created, existing };
}
