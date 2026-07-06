import { notFound, redirect } from "next/navigation";
import { defaultHomeForRole, readSession, sessionIsCurrent } from "@/lib/auth";
import { resolveTenant, tenantCanSignIn } from "@/lib/tenant";
import { TenantLoginScreen } from "@/components/tenant-login-screen";

export default async function TenantLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ reset?: string }>;
}) {
  const { tenantSlug } = await params;
  const query = await searchParams;

  const tenant = await resolveTenant(tenantSlug);
  if (!tenant) notFound();

  const session = await readSession();

  if (session && (await sessionIsCurrent(session))) {
    redirect(defaultHomeForRole(session.role));
  }

  return (
    <TenantLoginScreen
      reset={query.reset}
      tenant={{
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        address: tenant.address,
        blocked: !tenantCanSignIn(tenant),
        advisory: tenant.advisories[0]?.message,
      }}
    />
  );
}