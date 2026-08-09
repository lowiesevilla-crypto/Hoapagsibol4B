import type {
  Prisma,
  RepositoryDocumentStatus,
  RepositoryDocumentVisibility,
} from "@prisma/client";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { hasRepositoryPermission } from "@/lib/document-repository/access";
import { ensureRepositoryDefaultCategories as initializeRepositoryDefaultCategories } from "@/lib/document-repository/categories";
import { evaluateRepositoryQuota } from "@/lib/document-repository/quota";

export type RepositoryListFilters = {
  search?: string;
  categoryId?: string;
  status?: RepositoryDocumentStatus;
  visibility?: RepositoryDocumentVisibility;
  page?: number;
  pageSize?: number;
};

/**
 * Read surfaces may request taxonomy initialization, but only an actor who
 * actually has category-management permission is allowed to create defaults.
 * Read-only staff never gain an implicit write capability by opening the page.
 */
export async function ensureRepositoryDefaultCategories(_input?: { tenantId?: string; actorId?: string | null }) {
  if (!hasRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES)) {
    return { created: 0, existing: 0 };
  }
  return initializeRepositoryDefaultCategories();
}

export async function repositoryUsageBytes(tenantId: string) {
  const [documents, revisions] = await Promise.all([
    prisma.repositoryDocument.aggregate({
      where: { tenantId },
      _sum: { fileSizeBytes: true },
    }),
    prisma.repositoryDocumentRevision.aggregate({
      where: { tenantId, storageKey: { not: null } },
      _sum: { fileSizeBytes: true },
    }),
  ]);

  return (documents._sum.fileSizeBytes ?? BigInt(0)) + (revisions._sum.fileSizeBytes ?? BigInt(0));
}

export async function getRepositoryDashboard(input: {
  tenantId: string;
  maximumStorageMb: number | null;
}) {
  const [total, publishedPublic, drafts, protectedCount, usedBytes] = await Promise.all([
    prisma.repositoryDocument.count({ where: { tenantId: input.tenantId } }),
    prisma.repositoryDocument.count({
      where: {
        tenantId: input.tenantId,
        status: "PUBLISHED",
        visibility: "TENANT_PUBLIC",
      },
    }),
    prisma.repositoryDocument.count({
      where: { tenantId: input.tenantId, status: "DRAFT" },
    }),
    prisma.repositoryDocument.count({
      where: {
        tenantId: input.tenantId,
        visibility: { in: ["INTERNAL", "RESTRICTED"] },
      },
    }),
    repositoryUsageBytes(input.tenantId),
  ]);

  return {
    total,
    publishedPublic,
    drafts,
    protectedCount,
    quota: evaluateRepositoryQuota({
      usedBytes,
      maximumStorageMb: input.maximumStorageMb,
      requestedBytes: 0,
    }),
  };
}

export async function listRepositoryCategories(tenantId: string) {
  return prisma.repositoryDocumentCategory.findMany({
    where: { tenantId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listRepositoryDocuments(tenantId: string, filters: RepositoryListFilters = {}) {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(filters.pageSize ?? 25)));
  const search = filters.search?.trim();

  const where: Prisma.RepositoryDocumentWhereInput = {
    tenantId,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.visibility ? { visibility: filters.visibility } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search } },
            { description: { contains: search } },
            { documentReference: { contains: search } },
            { originalFileName: { contains: search } },
            { searchableKeywords: { contains: search } },
          ],
        }
      : {}),
  };

  const [total, documents] = await Promise.all([
    prisma.repositoryDocument.count({ where }),
    prisma.repositoryDocument.findMany({
      where,
      include: { category: true },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    documents,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getRepositoryDocumentForTenant(tenantId: string, documentId: string) {
  return prisma.repositoryDocument.findFirst({
    where: { tenantId, id: documentId },
    include: {
      category: true,
      revisions: { orderBy: { revision: "desc" } },
      tagAssignments: { include: { tag: true } },
    },
  });
}
