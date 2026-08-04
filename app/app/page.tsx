import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { defaultHomeForRole, readSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Open App",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AppLauncherPage() {
  const session = await readSession();
  if (!session) redirect("/login");
  redirect(defaultHomeForRole(session.role));
}
