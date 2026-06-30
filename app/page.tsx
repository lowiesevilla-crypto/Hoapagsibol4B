import { redirect } from "next/navigation";
import { defaultHomeForRole, readSession } from "@/lib/auth";

export default async function Home() {
  const session = await readSession();
  redirect(session ? defaultHomeForRole(session.role) : "/login");
}
