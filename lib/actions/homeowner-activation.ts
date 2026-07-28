"use server";

import { redirect } from "next/navigation";
import { setSessionCookie } from "@/lib/auth";
import { completeHomeownerActivation, validateHomeownerActivationPassword } from "@/lib/services/homeowner-activation";

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

  const completion = await completeHomeownerActivation({ accountNumber, email, temporaryPassword, password });
  if ("error" in completion) return { error: completion.error };
  if (!("session" in completion)) return { error: "Activation could not be completed. Please try again." };
  const { session } = completion;

  await setSessionCookie(session);
  redirect("/portal/dashboard");
}
