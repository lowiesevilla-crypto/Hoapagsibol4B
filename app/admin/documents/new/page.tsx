import Link from "next/link";
import { ManualDocumentForm } from "@/components/manual-document-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveOrganizationOfficers } from "@/lib/organization";
import { getTenantDocumentConfigurations } from "@/lib/services/document-workflow";

export default async function NewAdminDocumentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const query = await searchParams; const [homeowners, officers, configs] = await Promise.all([prisma.homeownerProfile.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, include: { user: true }, orderBy: { user: { name: "asc" } } }), getActiveOrganizationOfficers(user.tenantId), getTenantDocumentConfigurations(user.tenantId, true)]);
  return <><PageHeader eyebrow="Document management" title="Generate new document" description="Create an official document for a walk-in or office transaction without requiring a homeowner submission." action={<Link className="btn-secondary" href="/admin/documents">Back to requests</Link>} />{query.error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{query.error}</div>}<ManualDocumentForm homeowners={homeowners.map((item) => ({ id: item.id, label: `${item.user.name} - Block ${item.block}, Lot ${item.lot}` }))} officers={officers.map((item) => ({ id: item.id, label: `${item.fullName} - ${item.position}` }))} templates={configs.filter((item) => item.template?.active).map((item) => ({ value: item.type, label: item.displayName }))} /></>;
}
