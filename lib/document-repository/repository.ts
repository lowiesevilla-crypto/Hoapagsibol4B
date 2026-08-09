import type {
  RepositoryDocumentStatus,
  RepositoryDocumentVisibility,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { repositoryDefaultCategories } from "@/lib/document-repository/constants";
import { evaluateRepositoryQuota } from "@/lib/document-repository/quota";

export type RepositoryListFilters = {
  search?: string;
  categoryId?: string;
  status?: RepositoryDocumentStatus;
  visibility?: RepositoryDocumentVisibility;
  page?: number;
  pageSize?: number;
};

export async function ensureRepositoryDefaultCategories(input: {
  tenantId: string;
  actorId?: string | null;
}) {
  for (const category of repositoryDefaultCategories) {
    await prisma.repositoryDocumentCategory.upsert({
      where: {
        tenantId_code: {
          tenantId: input.tenantId,
          code: category.code,
        },
      },
      update: {},
      create: {
        tenantId: input.tenantId,
        code: category.code,
        name: category.name,
        categoryGroup: category.group,
        description: null,
        active: true,
        sortOrder: category.sortOrder,
        systemDefault: true,
        governanceControlled: category.governed,
        createdById: input.actorId ?? null,
      },
    });
  }
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

  return (documents._sum.fileSizeBytes ?? 0n) + (revisions._sum.fileSizeBytes ?? 0n);
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

  const where = {
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
  } satisfies Parameters<typeof prisma.repositoryDocument.findMany>[0]["where"];

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
