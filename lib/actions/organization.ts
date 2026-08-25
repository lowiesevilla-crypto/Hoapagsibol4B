"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { asJson } from "@/lib/organization";
import { saveOrganizationImage } from "@/lib/organization-uploads";

export async function saveOrganizationOfficerAction(formData: FormData) {
  const actor = await requireUser(Role.SYSTEM_ADMIN);
  const id = clean(formData.get("id"));
  const fullName = clean(formData.get("fullName"));
  const position = clean(formData.get("position"));
  const effectiveDate = dateValue(formData.get("effectiveDate"));
  const endDate = optionalDate(formData.get("endDate"));
  if (!fullName || fullName.length < 3 || !position || !effectiveDate) return goError("Full name, position, and effective date are required.");
  if (endDate && endDate < effectiveDate) return goError("End date cannot be earlier than the effective date.");
  const existing = id ? await prisma.organizationOfficer.findUnique({ where: { id } }) : null;
  if (id && !existing) return goError("Officer record not found.");
  try {
    const photoUrl = await saveOrganizationImage(formData.get("photo"), actor.tenant.slug, "photos", existing?.photoUrl, formData.get("removePhoto") === "on");
    const signatureUrl = await saveOrganizationImage(formData.get("signature"), actor.tenant.slug, "signatures", existing?.signatureUrl, formData.get("removeSignature") === "on");
    const data = {
      fullName,
      position,
      committee: optionalText(formData.get("committee")),
      contactNumber: optionalText(formData.get("contactNumber")),
      email: optionalText(formData.get("email")),
      photoUrl,
      signatureUrl,
      displayOrder: Math.max(0, Number(formData.get("displayOrder")) || 0),
      active: formData.get("active") === "on",
      effectiveDate,
      endDate,
      updatedById: actor.id,
    };
    const officer = existing
      ? await prisma.organizationOfficer.update({ where: { id: existing.id }, data })
      : await prisma.organizationOfficer.create({ data });
    const action = existing ? "UPDATED" : "CREATED";
    await prisma.$transaction([
      prisma.organizationOfficerHistory.create({ data: { officerId: officer.id, action, snapshot: asJson(officer), actorId: actor.id } }),
      prisma.auditLog.create({ data: { actorId: actor.id, module: "ORGANIZATION", action: `${action}_OFFICER`, entityType: "OrganizationOfficer", entityId: officer.id, metadata: { fullName, position } } }),
    ]);
  } catch (error) {
    return goError(error instanceof Error ? error.message : "Officer record could not be saved.");
  }
  revalidateOrganization();
  redirect("/admin/settings/organization?success=Officer%20record%20saved%20successfully.");
}

export async function changeOrganizationOfficerStatusAction(formData: FormData) {
  const actor = await requireUser(Role.SYSTEM_ADMIN);
  const id = String(formData.get("id") || "");
  const operation = String(formData.get("operation") || "");
  const existing = await prisma.organizationOfficer.findUnique({ where: { id } });
  if (!existing) return goError("Officer record not found.");
  const officer = await prisma.organizationOfficer.update({
    where: { id },
    data: operation === "archive" ? { active: false, archivedAt: new Date(), updatedById: actor.id } : { active: operation === "activate", archivedAt: null, updatedById: actor.id },
  });
  const action = operation === "archive" ? "ARCHIVED" : officer.active ? "ACTIVATED" : "DEACTIVATED";
  await prisma.$transaction([
    prisma.organizationOfficerHistory.create({ data: { officerId: id, action, snapshot: asJson(officer), actorId: actor.id } }),
    prisma.auditLog.create({ data: { actorId: actor.id, module: "ORGANIZATION", action: `${action}_OFFICER`, entityType: "OrganizationOfficer", entityId: id, metadata: { fullName: officer.fullName } } }),
  ]);
  revalidateOrganization();
  redirect(`/admin/settings/organization?success=${action.toLowerCase()}%20successfully.`);
}

function clean(value: FormDataEntryValue | null) { return String(value || "").trim() || undefined; }
function optionalText(value: FormDataEntryValue | null) { return String(value || "").trim() || null; }
function dateValue(value: FormDataEntryValue | null) { const text = clean(value); if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined; const date = new Date(`${text}T00:00:00.000Z`); return Number.isNaN(date.valueOf()) ? undefined : date; }
function optionalDate(value: FormDataEntryValue | null) { return dateValue(value) || null; }
function goError(message: string): never { redirect(`/admin/settings/organization?error=${encodeURIComponent(message)}`); }
function revalidateOrganization() { for (const path of ["/admin/settings/organization", "/portal/organization", "/admin/documents"]) revalidatePath(path); }
