"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  deactivatePlatformTenant,
  hardDeletePlatformTenant,
  reactivatePlatformTenant,
} from "@/lib/services/platform-tenant-lifecycle";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

async function requirePlatformLifecycleUser() {
  const user = await requireUser();
  if (!user.roles.includes(Role.SUPER_ADMIN) && !user.roles.includes(Role.PLATFORM_ADMIN)) redirect("/admin/dashboard");
  return user;
}

function lifecycleErrorPath(tenantId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Tenant lifecycle operation failed.";
  return `/platform/tenants/${tenantId}/lifecycle?error=${encodeURIComponent(message)}`;
}

export async function deactivateTenantLifecycleAction(formData: FormData) {
  const actor = await requirePlatformLifecycleUser();
  const tenantId = clean(formData.get("tenantId"));
  if (!tenantId) redirect("/platform/tenants?error=Tenant%20not%20found.");
  try {
    await deactivatePlatformTenant({ tenantId, actorId: actor.id });
  } catch (error) {
    redirect(lifecycleErrorPath(tenantId, error));
  }
  revalidatePath("/platform/tenants");
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/platform/tenants/${tenantId}/lifecycle`);
  redirect(`/platform/tenants/${tenantId}/lifecycle?success=${encodeURIComponent("Tenant deactivated. All records and transactions were retained; active sessions were revoked.")}`);
}

export async function reactivateTenantLifecycleAction(formData: FormData) {
  const actor = await requirePlatformLifecycleUser();
  const tenantId = clean(formData.get("tenantId"));
  if (!tenantId) redirect("/platform/tenants?error=Tenant%20not%20found.");
  try {
    await reactivatePlatformTenant({ tenantId, actorId: actor.id });
  } catch (error) {
    redirect(lifecycleErrorPath(tenantId, error));
  }
  revalidatePath("/platform/tenants");
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/platform/tenants/${tenantId}/lifecycle`);
  redirect(`/platform/tenants/${tenantId}/lifecycle?success=${encodeURIComponent("Tenant reactivated. Existing records, transactions, and configuration were preserved.")}`);
}

export async function deleteTenantLifecycleAction(formData: FormData) {
  const actor = await requirePlatformLifecycleUser();
  const tenantId = clean(formData.get("tenantId"));
  if (!tenantId) redirect("/platform/tenants?error=Tenant%20not%20found.");

  let deletedTenantName = "Tenant";
  try {
    const deleted = await hardDeletePlatformTenant({
      tenantId,
      actorId: actor.id,
      actorTenantId: actor.tenantId,
      confirmationSlug: clean(formData.get("confirmationSlug")),
      confirmationWord: clean(formData.get("confirmationWord")),
    });
    deletedTenantName = deleted.deletedTenantName;
  } catch (error) {
    redirect(lifecycleErrorPath(tenantId, error));
  }

  revalidatePath("/platform/tenants");
  revalidatePath("/platform/subscriptions");
  redirect(`/platform/tenants?success=${encodeURIComponent(`${deletedTenantName} was permanently deleted with its tenant-owned records, transactions, and configuration.`)}`);
}
