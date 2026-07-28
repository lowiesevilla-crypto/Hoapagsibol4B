import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { defaultHomeForRole, readSession, sessionIsCurrent } from "@/lib/auth";
import { resolveTenant, tenantCanSignIn } from "@/lib/tenant";
import { TenantLoginScreen } from "@/components/tenant-login-screen";

export async function generateMetadata({ params }: { params: Promise<{ tenantSlug: string }> }): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await resolveTenant(tenantSlug);
  return tenant ? { title: tenant.name } : { title: { absolute: "HOAHub" } };
}

export default async function TenantLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ reset?: string; loggedOut?: string }>;
}) {
  const { tenantSlug } = await params;
  const query = await searchParams;

  const tenant = await resolveTenant(tenantSlug);
  if (!tenant) notFound();

  const session = await readSession();

  const previewingAsPlatformUser = session?.role === Role.SUPER_ADMIN || session?.role === Role.PLATFORM_ADMIN;

  if (session && !previewingAsPlatformUser && (await sessionIsCurrent(session))) {
    redirect(defaultHomeForRole(session.role));
  }

  return (
    <TenantLoginScreen
      reset={query.reset}
      loggedOut={query.loggedOut}
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
