"use server";

import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  activateAgreementTemplateVersion,
  createTenantAgreementDraft,
  declineTenantAgreement,
  issueAgreementOtp,
  sendAgreementInvitation,
  signTenantAgreement,
  tenantAgreementAdminRoleAllowed,
} from "@/lib/services/platform-agreements";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

async function requestMetadata() {
  const requestHeaders = await headers();
  return {
    ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || null,
    userAgent: requestHeaders.get("user-agent") || null,
  };
}

async function requirePlatformAgreementUser() {
  const user = await requireUser();
  if (!user.roles.includes(Role.SUPER_ADMIN) && !user.roles.includes(Role.PLATFORM_ADMIN)) redirect("/admin/dashboard");
  return user;
}

async function requireTenantAgreementSigner() {
  const user = await requireUser(Role.ADMIN);
  if (!tenantAgreementAdminRoleAllowed(user.roles)) redirect("/admin/subscription");
  return user;
}

export async function activateAgreementTemplateAction(formData: FormData) {
  const actor = await requirePlatformAgreementUser();
  const versionId = clean(formData.get("versionId"));
  const reviewerName = clean(formData.get("reviewerName"));
  const confirmed = formData.get("confirmLegalApproval") === "on";
  if (!confirmed) redirect("/platform/agreements?error=Confirm%20that%20the%20template%20has%20completed%20legal%20review%20before%20activation.");
  try {
    await activateAgreementTemplateVersion({
      versionId,
      reviewerName,
      reviewNotes: clean(formData.get("reviewNotes")),
      actorId: actor.id,
      actorTenantId: actor.tenantId,
    });
  } catch (error) {
    redirect(`/platform/agreements?error=${encodeURIComponent(error instanceof Error ? error.message : "Template activation failed.")}`);
  }
  revalidatePath("/platform/agreements");
  revalidatePath("/admin/agreement");
  redirect("/platform/agreements?success=Agreement%20template%20approved%20and%20activated.");
}

export async function generateTenantAgreementAction(formData: FormData) {
  const actor = await requirePlatformAgreementUser();
  const tenantId = clean(formData.get("tenantId"));
  if (!tenantId) redirect("/platform/agreements?error=Select%20a%20tenant.");
  let agreement;
  try {
    agreement = await createTenantAgreementDraft({ tenantId, actorId: actor.id });
  } catch (error) {
    redirect(`/platform/agreements?error=${encodeURIComponent(error instanceof Error ? error.message : "Agreement generation failed.")}`);
  }
  revalidatePath("/platform/agreements");
  revalidatePath("/admin/agreement");
  redirect(`/platform/agreements/${agreement.id}?success=Agreement%20generated.`);
}

export async function sendTenantAgreementAction(formData: FormData) {
  const actor = await requirePlatformAgreementUser();
  const agreementId = clean(formData.get("agreementId"));
  let sent;
  try {
    sent = await sendAgreementInvitation({ agreementId, actorId: actor.id });
  } catch (error) {
    redirect(`/platform/agreements/${agreementId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Agreement delivery failed.")}`);
  }
  revalidatePath("/platform/agreements");
  revalidatePath(`/platform/agreements/${agreementId}`);
  redirect(`/platform/agreements/${agreementId}?success=${encodeURIComponent(`Agreement sent to ${sent.recipients.join(", ")}.`)}`);
}

export async function requestAgreementOtpAction(formData: FormData) {
  const user = await requireTenantAgreementSigner();
  const agreementId = clean(formData.get("agreementId"));
  let result;
  try {
    result = await issueAgreementOtp({
      agreementId,
      tenantId: user.tenantId,
      userId: user.id,
      userName: user.name,
      email: user.email,
      metadata: await requestMetadata(),
    });
  } catch (error) {
    redirect(`/admin/agreement/${agreementId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Verification code could not be sent.")}`);
  }
  revalidatePath(`/admin/agreement/${agreementId}`);
  redirect(`/admin/agreement/${agreementId}?success=${encodeURIComponent(`Verification code sent to ${user.email}. It expires at ${result.expiresAt.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" })}.`)}`);
}

export async function signAgreementAction(formData: FormData) {
  const user = await requireTenantAgreementSigner();
  const agreementId = clean(formData.get("agreementId"));
  try {
    await signTenantAgreement({
      agreementId,
      tenantId: user.tenantId,
      userId: user.id,
      userName: user.name,
      email: user.email,
      signerName: clean(formData.get("signerName")),
      signerTitle: clean(formData.get("signerTitle")),
      otp: clean(formData.get("otp")),
      acceptedTerms: formData.get("acceptedTerms") === "on",
      confirmedAuthority: formData.get("confirmedAuthority") === "on",
      metadata: await requestMetadata(),
    });
  } catch (error) {
    redirect(`/admin/agreement/${agreementId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Agreement signing failed.")}`);
  }
  revalidatePath("/admin/agreement");
  revalidatePath(`/admin/agreement/${agreementId}`);
  revalidatePath("/platform/agreements");
  revalidatePath(`/platform/agreements/${agreementId}`);
  redirect(`/admin/agreement/${agreementId}?success=Agreement%20signed%20successfully.%20The%20executed%20copy%20is%20now%20immutable.`);
}

export async function declineAgreementAction(formData: FormData) {
  const user = await requireTenantAgreementSigner();
  const agreementId = clean(formData.get("agreementId"));
  try {
    await declineTenantAgreement({
      agreementId,
      tenantId: user.tenantId,
      userId: user.id,
      email: user.email,
      reason: clean(formData.get("reason")),
      metadata: await requestMetadata(),
    });
  } catch (error) {
    redirect(`/admin/agreement/${agreementId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Agreement could not be declined.")}`);
  }
  revalidatePath("/admin/agreement");
  revalidatePath(`/admin/agreement/${agreementId}`);
  revalidatePath("/platform/agreements");
  redirect(`/admin/agreement/${agreementId}?success=Agreement%20declined.%20HOAHub%20Platform%20Administration%20can%20review%20the%20reason.`);
}
