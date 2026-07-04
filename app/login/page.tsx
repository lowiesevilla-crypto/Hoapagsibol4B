import { redirect } from "next/navigation";
import { defaultHomeForRole, readSession, sessionIsCurrent } from "@/lib/auth";
import { DEFAULT_TENANT_SLUG, resolveTenant, tenantCanSignIn } from "@/lib/tenant";
import { TenantLoginScreen } from "@/components/tenant-login-screen";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string; tenantSlug?: string }> }) {
  const query = await searchParams;
  const tenant = await resolveTenant(query.tenantSlug || DEFAULT_TENANT_SLUG);
  if (!tenant) return <TenantLoginScreen tenant={{ name: "HOA Digital Hub", slug: DEFAULT_TENANT_SLUG, logoUrl: null, blocked: true, advisory: "The requested HOA portal could not be found." }} />;
  const session = await readSession();
  if (session && session.tenantSlug === tenant.slug && await sessionIsCurrent(session)) {
    redirect(defaultHomeForRole(session.role));
  }
  return <TenantLoginScreen reset={query.reset} tenant={{ name: tenant.name, slug: tenant.slug, logoUrl: tenant.logoUrl, address: tenant.address, blocked: !tenantCanSignIn(tenant), advisory: tenant.advisories[0]?.message }} />;
}
