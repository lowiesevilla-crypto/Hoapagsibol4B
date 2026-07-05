"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTenantLogo } from "@/lib/tenant-logo";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

export async function updateTenantLogoAction(formData: FormData) {
  const actor = await requireUser();
  if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.PLATFORM_ADMIN) redirect("/admin/dashboard");

  const tenantId = clean(formData.get("tenantId"));
  if (!tenantId) redirect("/platform/tenants?error=Tenant%20not%20found.");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) redirect("/platform/tenants?error=Tenant%20not%20found.");

  let resolvedLogo: string;
  try {
    const resolution = await resolveTenantLogo(formData, tenant.slug, tenant.logoUrl);
    resolvedLogo = resolution.url;
  } catch (error) {
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Tenant logo could not be processed.")}`);
  }

  await prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl: resolvedLogo } });
  await prisma.auditLog.create({ data: { tenantId, actorId: actor.id, module: "PLATFORM", action: "TENANT_LOGO_UPDATED", entityType: "Tenant", entityId: tenantId } });

  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/${tenant.slug}/login`);
  redirect(`/platform/tenants/${tenantId}?success=logo&message=Tenant%20logo%20updated%20successfully.`);
}
