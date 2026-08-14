"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { validateHoaHubUpload } from "@/lib/upload-policy";
import {
  addComplaintMessage,
  assignComplaint,
  requestIdentityAccess,
  requireComplaintAdmin,
  requireComplaintHomeowner,
  submitComplaint,
  trackAnonymousComplaint,
  updateComplaintStatus,
  type ComplaintIntakeState,
  type ComplaintTrackState,
} from "@/lib/services/complaints";

const complaintAttachmentExtensions = [".pdf", ".jpg", ".jpeg", ".png"] as const;

async function validateComplaintAttachment(formData: FormData) {
  const value = formData.get("attachment");
  if (!(value instanceof File) || value.size === 0) return;
  const bytes = new Uint8Array(await value.arrayBuffer());
  validateHoaHubUpload({
    fileName: value.name,
    contentType: value.type,
    size: value.size,
    data: bytes,
    maxBytes: 25 * 1024 * 1024,
    allowedExtensions: complaintAttachmentExtensions,
  });
}

export async function submitPortalComplaintAction(_previousState: ComplaintIntakeState, formData: FormData): Promise<ComplaintIntakeState> {
  try {
    const user = await requireComplaintHomeowner();
    await validateComplaintAttachment(formData);
    const result = await submitComplaint({ user, formData, tenantSlug: user.tenant.slug });
    revalidatePath("/portal/complaints");
    if (result.trackingCode) return result;
    return { ...result, message: "Complaint submitted successfully. It now appears in your complaint history." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Complaint could not be submitted." };
  }
}

export async function submitAdminComplaintAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  await validateComplaintAttachment(formData);
  const homeownerUserId = String(formData.get("homeownerUserId") || "");
  const effectiveUser = homeownerUserId
    ? await requireUser(Role.ADMIN).then(() => user)
    : user;
  await submitComplaint({ user: effectiveUser, formData, tenantSlug: user.tenant.slug });
  revalidatePath("/admin/complaints");
  redirect("/admin/complaints?success=Complaint%20submitted.");
}

export async function trackComplaintAction(_previousState: ComplaintTrackState, formData: FormData): Promise<ComplaintTrackState> {
  try {
    const complaint = await trackAnonymousComplaint(String(formData.get("trackingCode") || ""), String(formData.get("pin") || ""));
    return { status: "success", message: "Complaint found.", complaint };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Complaint could not be found." };
  }
}

export async function updateComplaintStatusAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  await updateComplaintStatus(user, formData);
  const id = String(formData.get("id") || "");
  revalidatePath("/admin/complaints");
  revalidatePath(`/admin/complaints/${id}`);
  redirect(`/admin/complaints/${id}?success=Status%20updated.`);
}

export async function addComplaintMessageAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  await addComplaintMessage(user, formData);
  const id = String(formData.get("id") || "");
  revalidatePath(`/admin/complaints/${id}`);
  redirect(`/admin/complaints/${id}?success=Message%20added.`);
}

export async function assignComplaintAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  await assignComplaint(user, formData);
  const id = String(formData.get("id") || "");
  revalidatePath(`/admin/complaints/${id}`);
  redirect(`/admin/complaints/${id}?success=Complaint%20assigned.`);
}

export async function requestIdentityAccessAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  await requestIdentityAccess(user, formData);
  const id = String(formData.get("id") || "");
  revalidatePath(`/admin/complaints/${id}`);
  redirect(`/admin/complaints/${id}?success=Identity%20access%20request%20recorded.`);
}
