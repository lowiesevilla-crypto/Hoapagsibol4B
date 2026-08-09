import "server-only";

import { Prisma } from "@prisma/client";
import { Permission } from "@/lib/authorization/permissions";
import { requireUser } from "@/lib/auth";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import type {
  RepositoryDocumentStatus,
  RepositoryDocumentVisibility,
} from "@/lib/document-repository/constants";
import { prisma } from "@/lib/db";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function pageSize(value?: number) {
  if (value == null) return DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(value) || value < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
}

function pageNumber(value?: number) {
  if (value == null || !Number.isSafeInteger(value) || value < 1) return 1;
  return value;
}

function searchWhere(search?: string): Prisma.RepositoryDocumentWhereInput | undefined {
  const query = search?.trim();
  if (!query) return undefined;
  return {
    OR: [
      { title: { contains: query } },
      { description: { contains: query } },
      { documentReference: { contains: query } },
      { originalFileName: { contains: query } },
      { resolutionNumber: { contains: query } },
      { memoNumber: { contains: query } },
      { policyOwner: { contains: query } },
      { searchableKeywords: { contains: query } },
    ],
  };
}

export type RepositoryAdminListInput = {
  search?: string;
  categoryId?: string;
  status?: RepositoryDocumentStatus;
  visibility?: RepositoryDocumentVisibility;
  page?: number;
  pageSize?: number;
};

export async function listRepositoryDocumentsForAdmin(input: RepositoryAdminListInput = {}) {
  await requireUser();
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_READ);
  const take = pageSize(input.pageSize);
  const page = pageNumber(input.page);
  const where: Prisma.RepositoryDocumentWhereInput = {
    tenantId: context.tenantId,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.visibility ? { visibility: input.visibility } : {}),
    ...(searchWhere(input.search) ?? {}),
  };

  const [documents, total] = await Promise.all([
    prisma.repositoryDocument.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        title: true,
        description: true,
        documentReference: true,
        status: true,
        visibility: true,
        currentRevision: true,
        originalFileName: true,
        contentType: true,
        fileExtension: true,
        fileSizeBytes: true,
        effectiveAt: true,
        expiresAt: true,
        publishedAt: true,
        updatedById: true,
        updatedAt: true,
        category: {
          select: { id: true, code: true, name: true, categoryGroup: true, governanceControlled: true },
        },
      },
    }),
    prisma.repositoryDocument.count({ where }),
  ]);

  return {
    documents,
    pagination: {
      page,
      pageSize: take,
      total,
      totalPages: Math.max(1, Math.ceil(total / take)),
    },
  };
}

export type RepositoryHomeownerListInput = {
  search?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
  now?: Date;
};

export async function listRepositoryDocumentsForHomeowner(input: RepositoryHomeownerListInput = {}) {
  await requireUser();
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_READ_PUBLIC);
  const take = pageSize(input.pageSize);
  const page = pageNumber(input.page);
  const now = input.now ?? new Date();
  const where: Prisma.RepositoryDocumentWhereInput = {
    tenantId: context.tenantId,
    status: "PUBLISHED",
    visibility: "TENANT_PUBLIC",
    malwareScanStatus: { notIn: ["PENDING", "FAILED", "BLOCKED"] },
    AND: [
      { OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ...(input.categoryId ? [{ categoryId: input.categoryId }] : []),
      ...(searchWhere(input.search) ? [searchWhere(input.search) as Prisma.RepositoryDocumentWhereInput] : []),
    ],
  };

  const [documents, total] = await Promise.all([
    prisma.repositoryDocument.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        title: true,
        description: true,
        documentReference: true,
        originalFileName: true,
        contentType: true,
        fileExtension: true,
        fileSizeBytes: true,
        effectiveAt: true,
        expiresAt: true,
        publishedAt: true,
        updatedAt: true,
        category: { select: { id: true, code: true, name: true, categoryGroup: true } },
      },
    }),
    prisma.repositoryDocument.count({ where }),
  ]);

  return {
    documents,
    pagination: {
      page,
      pageSize: take,
      total,
      totalPages: Math.max(1, Math.ceil(total / take)),
    },
  };
}
