"use server";

import { HomeownerActivationBulkSelectionMode, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { requestHomeownerActivationBulkJob } from "@/lib/services/homeowner-activation-bulk-jobs";

export async function queueHomeownerActivationBulkJobAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const mode = String(formData.get("mode") || "selected") === "filtered"
    ? HomeownerActivationBulkSelectionMode.FILTERED
    : HomeownerActivationBulkSelectionMode.SELECTED;
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim();
  if (!idempotencyKey) throw new Error("Bulk activation request is missing an idempotency key. Refresh the page and try again.");

  const selectedHomeownerIds = mode === HomeownerActivationBulkSelectionMode.SELECTED
    ? formData.getAll("homeownerId").map((value) => String(value)).filter(Boolean)
    : [];
  if (mode === HomeownerActivationBulkSelectionMode.SELECTED && !selectedHomeownerIds.length) {
    redirect(buildReturnUrl(formData, { error: "Select at least one first-time eligible homeowner." }));
  }

  const job = await requestHomeownerActivationBulkJob({
    tenantId: admin.tenantId,
    initiatedById: admin.id,
    idempotencyKey,
    selectionMode: mode,
    selectedHomeownerIds,
    filters: {
      q: String(formData.get("q") || ""),
      status: String(formData.get("status") || "all"),
      digital: String(formData.get("digital") || "all"),
    },
  });

  revalidatePath("/admin/homeowners");
  redirect(buildReturnUrl(formData, {
    activationJob: job.id,
    success: "bulkActivationQueued",
    message: job.totalTargets
      ? `Activation job queued for ${job.totalTargets} first-time eligible homeowner${job.totalTargets === 1 ? "" : "s"}.`
      : "No first-time eligible homeowners matched this request.",
  }));
}

function buildReturnUrl(formData: FormData, additions: Record<string, string>) {
  const params = new URLSearchParams();
  for (const key of ["q", "status", "digital", "page", "pageSize"] as const) {
    const value = String(formData.get(key) || "").trim();
    if (value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(additions)) params.set(key, value);
  return `/admin/homeowners?${params.toString()}`;
}
