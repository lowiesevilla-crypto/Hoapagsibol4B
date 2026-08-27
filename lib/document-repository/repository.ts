import type {
  Prisma,
  RepositoryDocumentStatus,
  RepositoryDocumentVisibility,
} from "@prisma/client";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { canRepositoryPermission, requireRepositoryRead } from "@/lib/document-repository/access";
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

export function repositoryDocumentWhere(tenantId: string, filters: RepositoryListFilters = {}): Prisma.RepositoryDocumentWhereInput {
  const search = filters.search?.trim();
  return {
    tenantId,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.visibility ? { visibility: filters.visibility } : {}),
    ...(search ? {
      OR: [
        { title: { contains: search } },
        { description: { contains: search } },
        { documentReference: { contains: search } },
        { originalFileName: { contains: search } },
        { searchableKeywords: { contains: search } },
      ],
    } : {}),
  };
}

/**
 * Read surfaces may request taxonomy initialization, but only an actor who
 * actually has category-management permission is allowed to create defaults.
 * Read-only staff never gain an implicit write capability by opening the page.
 */
export async function ensureRepositoryDefaultCategories() {
  if (!await canRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES)) {
    return { created: 0, existing: 0 };
  }
  return initializeRepositoryDefaultCategories();
}

async function repositoryUsageBytesForTenant(tenantId: string) {
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

export async function getRepositoryDashboard() {
  const { context, entitlement } = await requireRepositoryRead();
  const tenantId = context.tenantId;
  const [total, publishedPublic, drafts, protectedCount, usedBytes] = await Promise.all([
    prisma.repositoryDocument.count({ where: { tenantId } }),
    prisma.repositoryDocument.count({
      where: {
        tenantId,
        status: "PUBLISHED",
        visibility: "TENANT_PUBLIC",
      },
    }),
    prisma.repositoryDocument.count({
      where: { tenantId, status: "DRAFT" },
    }),
    prisma.repositoryDocument.count({
      where: {
        tenantId,
        visibility: { in: ["INTERNAL", "RESTRICTED"] },
      },
    }),
    repositoryUsageBytesForTenant(tenantId),
  ]);

  return {
    total,
    publishedPublic,
    drafts,
    protectedCount,
    quota: evaluateRepositoryQuota({
      usedBytes,
      maximumStorageMb: entitlement.storageLimitMb,
      requestedBytes: 0,
    }),
  };
}

export async function listRepositoryCategories() {
  const { context } = await requireRepositoryRead();
  return prisma.repositoryDocumentCategory.findMany({
    where: { tenantId: context.tenantId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listRepositoryDocuments(filters: RepositoryListFilters = {}) {
  const { context } = await requireRepositoryRead();
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(filters.pageSize ?? 25)));
  const where = repositoryDocumentWhere(context.tenantId, filters);

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

export async function getRepositoryDocumentForAdmin(documentId: string) {
  const { context } = await requireRepositoryRead();
  return prisma.repositoryDocument.findFirst({
    where: { tenantId: context.tenantId, id: documentId },
    include: {
      category: true,
      revisions: { orderBy: { revision: "desc" } },
      tagAssignments: { include: { tag: true } },
    },
  });
}
