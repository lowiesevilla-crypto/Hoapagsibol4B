"use server";

import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, defaultHomeForRole, deleteSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validation";

export type LoginState = { error?: string };

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check your login details." };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
    return { error: "Incorrect email or password." };
  }

  await createSession({ userId: user.id, role: user.role });
  redirect(defaultHomeForRole(user.role));
}

export async function logoutAction() {
  await deleteSession();
  redirect("/login");
}
