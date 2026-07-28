import { redirect } from "next/navigation";
import { defaultHomeForRole, readSession, sessionIsCurrent } from "@/lib/auth";
import { TenantLoginScreen } from "@/components/tenant-login-screen";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string; tenantSlug?: string }> }) {
  const query = await searchParams;
  const session = await readSession();
  if (session && await sessionIsCurrent(session)) {
    redirect(defaultHomeForRole(session.role));
  }
  return <TenantLoginScreen reset={query.reset} tenant={{ name: "HOAHub", slug: "", logoUrl: null }} universal />;
}
