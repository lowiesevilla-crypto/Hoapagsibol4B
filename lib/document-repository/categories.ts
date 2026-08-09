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
 * `createMany(..., skipDuplicates: true)` makes first-use initialization safe
 * under concurrent page loads. Existing tenant categories are never renamed or
 * overwritten, preserving tenant customizations while allowing later releases
 * to add new default category codes.
 */
export async function ensureRepositoryDefaultCategories(): Promise<RepositoryCategoryInitializationResult> {
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES);
  const result = await prisma.repositoryDocumentCategory.createMany({
    data: repositoryDefaultCategories.map((category) => ({
      tenantId: context.tenantId,
      code: category.code,
      name: category.name,
      categoryGroup: category.group,
      active: true,
      sortOrder: category.sortOrder,
      systemDefault: true,
      governanceControlled: category.governed,
    })),
    skipDuplicates: true,
  });

  return {
    created: result.count,
    existing: repositoryDefaultCategories.length - result.count,
  };
}
