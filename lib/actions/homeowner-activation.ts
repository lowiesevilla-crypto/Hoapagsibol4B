"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { markHomeownerActivated, validateHomeownerActivationPassword, verifyHomeownerActivationCredential } from "@/lib/services/homeowner-activation";
import { tenantCanSignIn } from "@/lib/tenant";

export type ActivationState = { error?: string };

export async function activateHomeownerAction(_state: ActivationState, formData: FormData): Promise<ActivationState> {
  const accountNumber = String(formData.get("accountNumber") || "");
  const email = String(formData.get("email") || "");
  const temporaryPassword = String(formData.get("temporaryPassword") || "");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!accountNumber || !email || !temporaryPassword || !password || !confirmPassword) return { error: "Complete all activation fields." };
  if (password !== confirmPassword) return { error: "Password confirmation does not match." };
  const passwordError = validateHomeownerActivationPassword(password);
  if (passwordError) return { error: passwordError };

  const verification = await verifyHomeownerActivationCredential({ accountNumber, email, temporaryPassword });
  if ("error" in verification) return { error: verification.error };
  const { profile, credential } = verification;
  if (!tenantCanSignIn(profile.user.tenant)) return { error: profile.user.tenant.advisories[0]?.message || "This HOA portal is currently unavailable." };

  await markHomeownerActivated({
    tenantId: profile.tenantId,
    profileId: profile.id,
    userId: profile.userId,
    credentialId: credential.id,
    password,
  });
  await createSession({ userId: profile.userId, role: profile.user.role, tenantId: profile.tenantId, tenantSlug: profile.user.tenant.slug });
  redirect("/portal/dashboard");
}
