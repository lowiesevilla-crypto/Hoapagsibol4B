import "server-only";

import { Permission } from "@/lib/authorization/permissions";
import { requireUser } from "@/lib/auth";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import { writeRepositoryAudit } from "@/lib/document-repository/audit";
import { RepositoryAuditAction } from "@/lib/document-repository/constants";
import { prisma } from "@/lib/db";

export type RepositoryCategoryInput = {
  name: string;
  code?: string | null;
  categoryGroup: string;
  description?: string | null;
  governanceControlled?: boolean;
  active?: boolean;
  sortOrder?: number;
};

function cleanText(value: string | null | undefined, label: string, maxLength: number, required = false) {
  const cleaned = value?.trim() || "";
  if (required && !cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > maxLength) throw new Error(`${label} must not exceed ${maxLength} characters.`);
  return cleaned || null;
}

function normalizeCode(value: string | null | undefined, fallbackName: string) {
  const source = (value?.trim() || fallbackName).toUpperCase();
  const normalized = source.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100);
  if (!normalized) throw new Error("Category code must contain a letter or number.");
  return normalized;
}

function normalizeGroup(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  if (!normalized) throw new Error("Category group is required.");
  return normalized;
}

function normalizeSortOrder(value: number | undefined) {
  const normalized = value ?? 500;
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > 9999) throw new Error("Category sort order must be a whole number from 0 to 9999.");
  return normalized;
}

export async function listRepositoryCategoriesForManagement() {
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES);
  return prisma.repositoryDocumentCategory.findMany({
    where: { tenantId: context.tenantId },
    include: { _count: { select: { documents: true } } },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createRepositoryCategory(input: RepositoryCategoryInput) {
  const actor = await requireUser();
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES);
  const name = cleanText(input.name, "Category name", 191, true)!;
  const code = normalizeCode(input.code, name);
  const categoryGroup = normalizeGroup(input.categoryGroup);
  const description = cleanText(input.description, "Category description", 4000);
  const sortOrder = normalizeSortOrder(input.sortOrder);

  const existing = await prisma.repositoryDocumentCategory.findFirst({
    where: { tenantId: context.tenantId, code },
    select: { id: true },
  });
  if (existing) throw new Error("A category with this code already exists in the active tenant.");

  const category = await prisma.repositoryDocumentCategory.create({
    data: {
      tenantId: context.tenantId,
      code,
      name,
      categoryGroup,
      description,
      active: input.active ?? true,
      sortOrder,
      systemDefault: false,
      governanceControlled: Boolean(input.governanceControlled),
      createdById: actor.id,
    },
  });

  await writeRepositoryAudit({
    action: RepositoryAuditAction.CATEGORY_CREATED,
    actorId: actor.id,
    documentId: category.id,
    entityType: "RepositoryDocumentCategory",
    metadata: {
      code: category.code,
      name: category.name,
      categoryGroup: category.categoryGroup,
      governanceControlled: category.governanceControlled,
      active: category.active,
      sortOrder: category.sortOrder,
    },
  });
  return category;
}

export async function updateRepositoryCategory(categoryId: string, input: RepositoryCategoryInput) {
  const actor = await requireUser();
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES);
  const id = cleanText(categoryId, "Category ID", 191, true)!;
  const existing = await prisma.repositoryDocumentCategory.findFirst({
    where: { tenantId: context.tenantId, id },
  });
  if (!existing) throw new Error("Repository category not found in the active tenant.");

  const name = cleanText(input.name, "Category name", 191, true)!;
  const categoryGroup = normalizeGroup(input.categoryGroup);
  const description = cleanText(input.description, "Category description", 4000);
  const sortOrder = normalizeSortOrder(input.sortOrder);
  const governanceControlled = existing.systemDefault
    ? existing.governanceControlled
    : Boolean(input.governanceControlled);

  const updated = await prisma.repositoryDocumentCategory.update({
    where: { tenantId_id: { tenantId: context.tenantId, id: existing.id } },
    data: {
      name,
      categoryGroup,
      description,
      active: input.active ?? existing.active,
      sortOrder,
      governanceControlled,
    },
  });

  await writeRepositoryAudit({
    action: RepositoryAuditAction.CATEGORY_UPDATED,
    actorId: actor.id,
    documentId: updated.id,
    entityType: "RepositoryDocumentCategory",
    metadata: {
      previous: {
        name: existing.name,
        categoryGroup: existing.categoryGroup,
        description: existing.description,
        active: existing.active,
        sortOrder: existing.sortOrder,
        governanceControlled: existing.governanceControlled,
      },
      updated: {
        name: updated.name,
        categoryGroup: updated.categoryGroup,
        description: updated.description,
        active: updated.active,
        sortOrder: updated.sortOrder,
        governanceControlled: updated.governanceControlled,
      },
      systemDefaultGovernanceLocked: existing.systemDefault,
    },
  });
  return updated;
}

export async function deleteRepositoryCategory(categoryId: string) {
  const actor = await requireUser();
  const { context } = await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES);
  const id = cleanText(categoryId, "Category ID", 191, true)!;
  const category = await prisma.repositoryDocumentCategory.findFirst({
    where: { tenantId: context.tenantId, id },
    include: { _count: { select: { documents: true } } },
  });
  if (!category) throw new Error("Repository category not found in the active tenant.");
  if (category.systemDefault) throw new Error("System default categories cannot be permanently deleted. Deactivate them instead.");
  if (category._count.documents > 0) throw new Error("This category still contains documents. Reclassify those documents or deactivate the category instead.");

  await prisma.repositoryDocumentCategory.delete({
    where: { tenantId_id: { tenantId: context.tenantId, id: category.id } },
  });

  await writeRepositoryAudit({
    action: RepositoryAuditAction.CATEGORY_DELETED,
    actorId: actor.id,
    documentId: category.id,
    entityType: "RepositoryDocumentCategory",
    metadata: {
      code: category.code,
      name: category.name,
      categoryGroup: category.categoryGroup,
      governanceControlled: category.governanceControlled,
      sortOrder: category.sortOrder,
    },
  });
  return category;
}
