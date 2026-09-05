"use server";

import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  applyAgreementIssueCommercialTerms,
  ensureAgreementOneTimeFeeSnapshot,
} from "@/lib/services/platform-agreement-commercial-terms";
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
  const startDate = clean(formData.get("startDate"));
  const endDate = clean(formData.get("endDate"));
  const freeTrialDaysRaw = clean(formData.get("freeTrialDays"));
  const convenienceFeeRaw = clean(formData.get("convenienceFeePerTransaction"));
  const mutualFeeAgreementConfirmed = formData.get("mutualFeeAgreementConfirmed") === "on";

  if (!tenantId) redirect("/platform/agreements?error=Select%20a%20tenant.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    redirect("/platform/agreements?error=Enter%20a%20valid%20Agreement%20Start%20Date%20and%20End%20Date.");
  }
  if (endDate < startDate) {
    redirect("/platform/agreements?error=Agreement%20End%20Date%20must%20be%20on%20or%20after%20the%20Start%20Date.");
  }

  const freeTrialDays = freeTrialDaysRaw === "" ? null : Number(freeTrialDaysRaw);
  if (freeTrialDays != null && (!Number.isInteger(freeTrialDays) || freeTrialDays < 0 || freeTrialDays > 3650)) {
    redirect("/platform/agreements?error=Free%20Trial%20Days%20must%20be%20a%20whole%20number%20between%200%20and%203650.");
  }

  const convenienceFeePerTransaction = convenienceFeeRaw === "" ? 2 : Number(convenienceFeeRaw);
  if (!Number.isFinite(convenienceFeePerTransaction) || convenienceFeePerTransaction < 0) {
    redirect("/platform/agreements?error=Enter%20a%20valid%20non-negative%20HOAHub%20Convenience%20Fee.");
  }
  const isStandardConvenienceRate = Math.round(convenienceFeePerTransaction * 100) === 200;
  if (!isStandardConvenienceRate && !mutualFeeAgreementConfirmed) {
    redirect("/platform/agreements?error=A%20convenience%20fee%20different%20from%20the%20standard%20PHP%202.00%20rate%20requires%20confirmation%20of%20a%20mutual%20HOA%20agreement.");
  }

  let agreement;
  try {
    agreement = await createTenantAgreementDraft({ tenantId, actorId: actor.id });
    agreement = await ensureAgreementOneTimeFeeSnapshot({ agreementId: agreement.id, actorId: actor.id });
    agreement = await applyAgreementIssueCommercialTerms({
      agreementId: agreement.id,
      actorId: actor.id,
      startDate,
      endDate,
      freeTrialDays,
      convenienceFeePerTransaction,
      mutualFeeAgreementConfirmed,
    });
  } catch (error) {
    redirect(`/platform/agreements?error=${encodeURIComponent(error instanceof Error ? error.message : "Agreement generation failed.")}`);
  }
  revalidatePath("/platform/agreements");
  revalidatePath("/admin/agreement");
  redirect(`/platform/agreements/${agreement.id}?success=Agreement%20generated%20with%20start%2Fend%20dates%2C%20trial%2C%20setup%20fee%2C%20and%20convenience%20fee%20snapshot.`);
}

export async function sendTenantAgreementAction(formData: FormData) {
  const actor = await requirePlatformAgreementUser();
  const agreementId = clean(formData.get("agreementId"));
  let sent;
  try {
    await ensureAgreementOneTimeFeeSnapshot({ agreementId, actorId: actor.id });
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
