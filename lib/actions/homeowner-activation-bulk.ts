"use server";

import { HomeownerActivationBulkSelectionMode, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { drainHomeownerActivationBulkJobs, requestHomeownerActivationBulkJob } from "@/lib/services/homeowner-activation-bulk-jobs";

export async function queueHomeownerActivationBulkJobAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  if (process.env.HOMEOWNER_ACTIVATION_BULK_DELIVERY_ENABLED !== "true") {
    redirect(buildReturnUrl(formData, { error: "Bulk activation delivery is staged but not enabled for production rollout yet." }));
  }

  const intent = parseIntent(formData);
  const mode = intent.selection === "filtered"
    ? HomeownerActivationBulkSelectionMode.FILTERED
    : HomeownerActivationBulkSelectionMode.SELECTED;
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim();
  if (!idempotencyKey) throw new Error("Bulk activation request is missing an idempotency key. Refresh the page and try again.");

  if (intent.sendMode === "reissue" && mode !== HomeownerActivationBulkSelectionMode.SELECTED) {
    redirect(buildReturnUrl(formData, { error: "Activation reissue is selected-only so already invited homeowners are never reissued by a broad filter." }));
  }
  const selectedFieldName = intent.sendMode === "reissue" ? "reissueHomeownerId" : "homeownerId";
  const selectedHomeownerIds = mode === HomeownerActivationBulkSelectionMode.SELECTED
    ? formData.getAll(selectedFieldName).map((value) => String(value)).filter(Boolean)
    : [];
  if (mode === HomeownerActivationBulkSelectionMode.SELECTED && !selectedHomeownerIds.length) {
    redirect(buildReturnUrl(formData, { error: intent.sendMode === "reissue" ? "Select at least one invited or expired homeowner to reissue." : "Select at least one first-time eligible homeowner." }));
  }

  const job = await requestHomeownerActivationBulkJob({
    tenantId: admin.tenantId,
    initiatedById: admin.id,
    idempotencyKey,
    selectionMode: mode,
    sendMode: intent.sendMode,
    selectedHomeownerIds,
    filters: {
      q: String(formData.get("q") || ""),
      status: String(formData.get("status") || "all"),
      digital: String(formData.get("digital") || "all"),
    },
  });

  if (job.totalTargets > 0) {
    after(async () => {
      await drainHomeownerActivationBulkJobs(admin.tenantId).catch((error) => {
        console.error("[homeowner-activation-bulk] queued job drain failed", {
          error: error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 300) : "Unknown activation bulk worker error",
        });
      });
    });
  }

  revalidatePath("/admin/homeowners");
  redirect(buildReturnUrl(formData, {
    activationJob: job.id,
    success: "bulkActivationQueued",
    message: job.totalTargets
      ? `Activation ${intent.sendMode === "reissue" ? "reissue" : "first-time"} job queued for ${job.totalTargets} homeowner${job.totalTargets === 1 ? "" : "s"}.`
      : intent.sendMode === "reissue" ? "No reissue-eligible homeowners matched this request." : "No first-time eligible homeowners matched this request.",
  }));
}

function parseIntent(formData: FormData): { sendMode: "firstTime" | "reissue"; selection: "selected" | "filtered" } {
  const raw = String(formData.get("intent") || "");
  if (raw === "firstTime:filtered") return { sendMode: "firstTime", selection: "filtered" };
  if (raw === "reissue:selected") return { sendMode: "reissue", selection: "selected" };
  if (String(formData.get("mode") || "") === "filtered") return { sendMode: "firstTime", selection: "filtered" };
  return { sendMode: "firstTime", selection: "selected" };
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
