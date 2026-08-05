import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HomeownerImportForm } from "./homeowner-import-form";

export default async function TenantOnboardingPage() {
  const user = await requireUser();
  if (!user.permissions.includes("settings.manage") && !user.permissions.includes("homeowners.manage")) throw new Error("Forbidden");
  const [tenant, administratorCount, homeownerCount, activeBillingRules, lastPreview] = await Promise.all([
    prisma.tenant.findFirst({ where: { id: user.tenantId }, select: { name: true, shortName: true, address: true, contactNumber: true, email: true, logoUrl: true } }),
    prisma.userRoleAssignment.count({ where: { tenantId: user.tenantId, active: true, role: { in: ["HOA_ADMIN", "ADMIN", "SYSTEM_ADMIN"] } } }),
    prisma.homeownerProfile.count({ where: { tenantId: user.tenantId } }),
    prisma.billingRule.count({ where: { tenantId: user.tenantId, active: true } }),
    prisma.auditLog.findFirst({ where: { tenantId: user.tenantId, module: "ONBOARDING", action: "BILLING_PREVIEW_CONFIRMED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const profileReady = Boolean(tenant?.name && tenant.shortName && tenant.address && tenant.contactNumber && tenant.email);
  const steps = [
    { title: "HOA profile and branding", complete: profileReady, href: "/admin/settings", detail: "Identity, address, contact details, logo, and operational settings." },
    { title: "Initial tenant administrator", complete: administratorCount > 0, href: "/admin/settings/users", detail: `${administratorCount} active administrator assignment${administratorCount === 1 ? "" : "s"}.` },
    { title: "Privacy and operating checklist", complete: false, href: "/docs/Pagsibol_HOA_Portal_User_Manual.md", detail: "Review data handling, activation, retention, and support responsibilities." },
    { title: "Homeowners and properties", complete: homeownerCount > 0, href: "#homeowner-import", detail: `${homeownerCount} homeowner record${homeownerCount === 1 ? "" : "s"} currently loaded.` },
    { title: "Billing rules", complete: activeBillingRules > 0, href: "/admin/billing-rules", detail: `${activeBillingRules} active billing rule${activeBillingRules === 1 ? "" : "s"}.` },
    { title: "First billing preview", complete: Boolean(lastPreview), href: "/admin/billing", detail: lastPreview ? `Confirmed ${lastPreview.createdAt.toLocaleString()}.` : "Preview is separate from generation; no bills are created by onboarding." },
  ];
  const completed = steps.filter((step) => step.complete).length;
  return (
    <main className="space-y-6">
      <header className="rounded-xl bg-slate-900 p-6 text-white">
        <p className="text-sm font-medium text-slate-300">Tenant onboarding</p>
        <h1 className="mt-1 text-2xl font-bold">Pilot readiness command center</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-200">Progress is derived from durable tenant records, so this workflow can be safely resumed after logout or browser interruption.</p>
        <p className="mt-4 text-sm font-semibold">{completed} of {steps.length} readiness steps complete</p>
      </header>
      <section className="grid gap-3 md:grid-cols-2" aria-label="Onboarding checklist">
        {steps.map((step, index) => (
          <Link key={step.title} href={step.href} className="rounded-xl border bg-white p-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
            <div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{index + 1}. {step.title}</h2><span className={`rounded-full px-2 py-1 text-xs font-semibold ${step.complete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{step.complete ? "Complete" : "Action required"}</span></div>
            <p className="mt-2 text-sm text-slate-600">{step.detail}</p>
          </Link>
        ))}
      </section>
      <div id="homeowner-import"><HomeownerImportForm /></div>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Billing safety gate</h2>
        <p className="mt-1 text-sm text-slate-600">Configure rules and run a preview in Billing. Generation remains a separate permission-controlled action and is never triggered by this onboarding page.</p>
        <div className="mt-4 flex flex-wrap gap-2"><Link className="rounded-md border px-3 py-2 text-sm font-medium" href="/admin/billing-rules">Configure billing rules</Link><Link className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white" href="/admin/billing">Open billing preview</Link></div>
      </section>
    </main>
  );
}
