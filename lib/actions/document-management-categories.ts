"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createRepositoryCategory,
  deleteRepositoryCategory,
  updateRepositoryCategory,
} from "@/lib/document-repository/category-management";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function intValue(value: FormDataEntryValue | null, fallback: number) {
  const raw = clean(value);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) throw new Error("Sort order must be a whole number.");
  return parsed;
}

function categoriesUrl(type: "success" | "error", message: string) {
  return `/admin/document-management/categories?${type}=${encodeURIComponent(message)}`;
}

export async function createRepositoryCategoryAction(formData: FormData) {
  try {
    const category = await createRepositoryCategory({
      name: clean(formData.get("name")),
      code: clean(formData.get("code")) || null,
      categoryGroup: clean(formData.get("categoryGroup")),
      description: clean(formData.get("description")) || null,
      governanceControlled: formData.get("governanceControlled") === "on",
      active: true,
      sortOrder: intValue(formData.get("sortOrder"), 500),
    });
    revalidatePath("/admin/document-management");
    revalidatePath("/admin/document-management/categories");
    redirect(categoriesUrl("success", `Category “${category.name}” created.`));
  } catch (error) {
    redirect(categoriesUrl("error", error instanceof Error ? error.message : "Category creation failed."));
  }
}

export async function updateRepositoryCategoryAction(formData: FormData) {
  const categoryId = clean(formData.get("categoryId"));
  try {
    const category = await updateRepositoryCategory(categoryId, {
      name: clean(formData.get("name")),
      categoryGroup: clean(formData.get("categoryGroup")),
      description: clean(formData.get("description")) || null,
      governanceControlled: formData.get("governanceControlled") === "on",
      active: formData.get("active") === "on",
      sortOrder: intValue(formData.get("sortOrder"), 500),
    });
    revalidatePath("/admin/document-management");
    revalidatePath("/admin/document-management/categories");
    redirect(categoriesUrl("success", `Category “${category.name}” updated.`));
  } catch (error) {
    redirect(categoriesUrl("error", error instanceof Error ? error.message : "Category update failed."));
  }
}

export async function deleteRepositoryCategoryAction(formData: FormData) {
  const categoryId = clean(formData.get("categoryId"));
  const confirmation = clean(formData.get("confirmation"));
  if (confirmation !== "DELETE") redirect(categoriesUrl("error", "Type DELETE to confirm category deletion."));
  try {
    const category = await deleteRepositoryCategory(categoryId);
    revalidatePath("/admin/document-management");
    revalidatePath("/admin/document-management/categories");
    redirect(categoriesUrl("success", `Category “${category.name}” permanently deleted.`));
  } catch (error) {
    redirect(categoriesUrl("error", error instanceof Error ? error.message : "Category deletion failed."));
  }
}
