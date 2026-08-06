"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { setSessionCookie } from "@/lib/auth";
import { completeHomeownerActivation, validateHomeownerActivationPassword } from "@/lib/services/homeowner-activation";
import {
  ACTIVATION_HANDOFF_COOKIE,
  completeHomeownerActivationFromHandoff,
} from "@/lib/services/homeowner-activation-handoff";

export type ActivationState = { error?: string };

export async function activateHomeownerAction(_state: ActivationState, formData: FormData): Promise<ActivationState> {
  const activationMode = String(formData.get("activationMode") || "legacy");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!password || !confirmPassword) return { error: "Create and confirm your permanent password." };
  if (password !== confirmPassword) return { error: "Password confirmation does not match." };
  const passwordError = validateHomeownerActivationPassword(password);
  if (passwordError) return { error: passwordError };

  if (activationMode === "handoff") {
    const store = await cookies();
    const handoff = store.get(ACTIVATION_HANDOFF_COOKIE)?.value || "";
    if (!handoff) return { error: "The secure activation handoff expired. Open the newest activation email and verify your email again." };
    const completion = await completeHomeownerActivationFromHandoff({ handoff, password });
    if ("error" in completion) return { error: completion.error };
    store.delete(ACTIVATION_HANDOFF_COOKIE);
    await setSessionCookie(completion.session);
    redirect("/portal/dashboard");
  }

  const accountNumber = String(formData.get("accountNumber") || "");
  const email = String(formData.get("email") || "");
  const temporaryPassword = String(formData.get("temporaryPassword") || "");
  if (!accountNumber || !email || !temporaryPassword) return { error: "Complete all activation fields." };

  const completion = await completeHomeownerActivation({ accountNumber, email, temporaryPassword, password });
  if ("error" in completion) return { error: completion.error };
  if (!("session" in completion)) return { error: "Activation could not be completed. Please try again." };
  const { session } = completion;

  await setSessionCookie(session);
  redirect("/portal/dashboard");
}
