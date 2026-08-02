"use server";

import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";
import {
  analyzeApprovedPassTemplateInstallation,
  applyApprovedPassTemplateInstallation,
  approvedPassTemplateConfirmationPhrase,
  approvedPassTemplateInstallerEnabled,
  approvedPassTemplateInstallerPath,
  assertApprovedPassTemplateInstallerRole,
  assertInstallerConfirmation,
  assertTargetTenant,
  installationPlanDigest,
  sanitizePlanForDisplay,
} from "@/lib/services/approved-pass-template-installer";

const dryRunCookieName = "approved_pass_template_installer_dry_run";

export async function dryRunApprovedPassTemplateInstallerAction() {
  noStore();
  const admin = await requireDocumentTemplateAdmin();
  let status = "dry-run-ok";
  let message = "Dry run passed. Apply is available for this session.";
  try {
    if (!approvedPassTemplateInstallerEnabled()) throw new Error("Approved pass template installer is unavailable.");
    assertApprovedPassTemplateInstallerRole(admin.role);
    assertTargetTenant(admin.tenantId);
    const plans = await analyzeApprovedPassTemplateInstallation({ tenantId: admin.tenantId });
    if (plans.some((plan) => plan.action === "BLOCKED")) {
      await clearDryRunCookie();
      status = "blocked";
      message = "EXISTING PRODUCTION DRAFT REQUIRES REVIEW";
    } else {
      const digest = installationPlanDigest({ actorUserId: admin.id, tenantId: admin.tenantId, plans });
      await setDryRunCookie(digest);
    }
  } catch (error) {
    await clearDryRunCookie();
    status = "error";
    message = errorMessage(error);
  }
  redirectWith(status, message);
}

export async function applyApprovedPassTemplateInstallerAction(formData: FormData) {
  noStore();
  const admin = await requireDocumentTemplateAdmin();
  let status = "applied";
  let message = "Approved Draft templates were already installed; no duplicate versions were created.";
  try {
    if (!approvedPassTemplateInstallerEnabled()) throw new Error("Approved pass template installer is unavailable.");
    assertApprovedPassTemplateInstallerRole(admin.role);
    assertTargetTenant(admin.tenantId);
    assertInstallerConfirmation({ phrase: formData.get("confirmationPhrase"), acknowledged: formData.get("publishedUnchanged") });
    const plans = await analyzeApprovedPassTemplateInstallation({ tenantId: admin.tenantId });
    if (plans.some((plan) => plan.action === "BLOCKED")) throw new Error("EXISTING PRODUCTION DRAFT REQUIRES REVIEW");
    const digest = installationPlanDigest({ actorUserId: admin.id, tenantId: admin.tenantId, plans });
    const cookieDigest = (await cookies()).get(dryRunCookieName)?.value;
    if (!cookieDigest || cookieDigest !== digest) throw new Error("Run a successful dry-run in this authenticated session before applying.");
    const result = await applyApprovedPassTemplateInstallation({ actorUserId: admin.id, tenantId: admin.tenantId, dryRunDigest: digest });
    await clearDryRunCookie();
    const created = result.createdVersions.length;
    message = created
      ? `Created ${created} approved Draft template version${created === 1 ? "" : "s"}.`
      : "Approved Draft templates were already installed; no duplicate versions were created.";
  } catch (error) {
    await clearDryRunCookie();
    status = "error";
    message = errorMessage(error);
  }
  redirectWith(status, message);
}

export async function currentApprovedPassTemplateDryRunDigest() {
  noStore();
  return (await cookies()).get(dryRunCookieName)?.value ?? null;
}

export async function currentApprovedPassTemplateDryRunReady(input: { actorUserId: string; tenantId: string }) {
  noStore();
  const cookieDigest = await currentApprovedPassTemplateDryRunDigest();
  if (!cookieDigest) return false;
  const plans = await analyzeApprovedPassTemplateInstallation({ tenantId: input.tenantId });
  return cookieDigest === installationPlanDigest({ actorUserId: input.actorUserId, tenantId: input.tenantId, plans })
    && plans.every((plan) => plan.action !== "BLOCKED");
}

export async function approvedPassTemplateInstallerSnapshot(input: { actorUserId: string; tenantId: string }) {
  noStore();
  const plans = await analyzeApprovedPassTemplateInstallation({ tenantId: input.tenantId });
  const dryRunReady = await currentApprovedPassTemplateDryRunReady(input);
  return {
    dryRunReady,
    confirmationPhrase: approvedPassTemplateConfirmationPhrase,
    plans: plans.map(sanitizePlanForDisplay),
  };
}

async function setDryRunCookie(value: string) {
  const store = await cookies();
  store.set(dryRunCookieName, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: approvedPassTemplateInstallerPath,
    maxAge: 10 * 60,
  });
}

async function clearDryRunCookie() {
  const store = await cookies();
  store.delete(dryRunCookieName);
}

function redirectWith(status: string, message: string): never {
  const params = new URLSearchParams({ status, message });
  redirect(`${approvedPassTemplateInstallerPath}?${params.toString()}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Approved pass template installer failed.";
}
