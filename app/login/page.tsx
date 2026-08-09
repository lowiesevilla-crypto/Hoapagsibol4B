import { redirect } from "next/navigation";
import { defaultHomeForRole, readSession, sessionIsCurrent } from "@/lib/auth";
import { safeReturnTo } from "@/lib/auth-return-to";
import { TenantLoginScreen } from "@/components/tenant-login-screen";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string; tenantSlug?: string; loggedOut?: string; returnTo?: string }> }) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  const session = await readSession();
  if (session && await sessionIsCurrent(session)) {
    redirect(returnTo || defaultHomeForRole(session.role));
  }
  return <TenantLoginScreen reset={query.reset} loggedOut={query.loggedOut} returnTo={returnTo || undefined} tenant={{ name: "HOAHub", slug: "", logoUrl: null }} universal />;
}
