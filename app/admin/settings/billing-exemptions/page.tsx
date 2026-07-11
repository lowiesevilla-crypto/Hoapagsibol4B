import Link from "next/link";
import type { ReactNode } from "react";
import { RecurringChargeType } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { ConfirmSubmitButton, SearchInput, SubmitButton } from "@/components/ui";
import { deactivateBillingExemptionAction, saveBillingExemptionAction } from "@/lib/actions/billing-rules";
import { requireBillingSettingsAccess } from "@/lib/billing-access";
import { prisma } from "@/lib/db";
import { periodFromDate } from "@/lib/services/billing-rules";
import { shortDate } from "@/lib/utils";

export default async function BillingExemptionsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; success?: string }> }) {
  const user = await requireBillingSettingsAccess();
  const query = await searchParams;
  const activeFilter = query.status === "inactive" ? false : query.status === "all" ? undefined : true;
  const [homeowners, exemptions] = await Promise.all([
    prisma.homeownerProfile.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
    prisma.duesExemption.findMany({ where: { tenantId: user.tenantId, recurringChargeType: RecurringChargeType.MONTHLY_DUES, ...(activeFilter === undefined ? {} : { active: activeFilter }) }, include: { homeowner: { include: { user: true } }, createdBy: true }, orderBy: [{ active: "desc" }, { createdAt: "desc" }] }),
  ]);
  const today = new Date();

  return <>
    <PageHeader eyebrow="Finance settings" title="Billing exemptions" description="Create period-based monthly dues exemptions by homeowner/property. Deactivation preserves history." action={<Link className="btn-secondary" href="/admin/settings/billing-rules">Billing rules</Link>} />

    <form action={saveBillingExemptionAction} className="card mb-6">
      <div className="mb-5"><h2 className="text-lg font-black">Add exemption</h2><p className="text-sm leading-6 text-slate-500">The monthly dues generator skips active exemptions that cover the target billing month and logs the skip reason.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Homeowner / property"><select className="field" name="homeownerId" required><option value="">Select homeowner</option>{homeowners.map((homeowner) => <option key={homeowner.id} value={homeowner.id}>{homeowner.user.name} - B{homeowner.block} L{homeowner.lot}</option>)}</select></Field>
        <Field label="Start month"><select className="field" name="startMonth" defaultValue={today.getUTCMonth() + 1}>{monthOptions()}</select></Field>
        <Field label="Start year"><input className="field" name="startYear" type="number" min="1900" max="2200" defaultValue={today.getUTCFullYear()} required /></Field>
        <Field label="End month"><select className="field" name="endMonth" defaultValue={today.getUTCMonth() + 1}>{monthOptions()}</select></Field>
        <Field label="End year"><input className="field" name="endYear" type="number" min="1900" max="2200" defaultValue={today.getUTCFullYear()} required /></Field>
        <Field label="Resolution reference"><input className="field" name="resolutionReference" placeholder="Board Resolution No. 2026-04" /></Field>
        <Field label="Approved by"><input className="field" name="approvedBy" placeholder="Board / Treasurer" /></Field>
        <div className="md:col-span-2 xl:col-span-4"><Field label="Reason"><input className="field" name="reason" placeholder="Developer-owned unit, approved waiver, renovation period..." required /></Field></div>
      </div>
      <div className="mt-5"><SubmitButton>Add exemption</SubmitButton></div>
    </form>

    <section className="card">
      <div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div><h2 className="text-lg font-black">Exemption history</h2><p className="text-sm text-slate-500">Search by homeowner, property, reason, or resolution.</p></div>
        <div className="flex flex-wrap gap-2"><SearchInput placeholder="Search exemptions" /><Link className={`btn-secondary min-h-9 px-3 py-1.5 text-xs ${query.status !== "all" && query.status !== "inactive" ? "border-pine-500" : ""}`} href="/admin/settings/billing-exemptions">Active</Link><Link className={`btn-secondary min-h-9 px-3 py-1.5 text-xs ${query.status === "inactive" ? "border-pine-500" : ""}`} href="/admin/settings/billing-exemptions?status=inactive">Inactive</Link><Link className={`btn-secondary min-h-9 px-3 py-1.5 text-xs ${query.status === "all" ? "border-pine-500" : ""}`} href="/admin/settings/billing-exemptions?status=all">All</Link></div>
      </div>
      <div className="table-wrap shadow-none"><table className="data-table min-w-[1050px]"><thead><tr><th>Homeowner</th><th>Property</th><th>Period</th><th>Reason</th><th>Resolution</th><th>Approved by</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>{exemptions.map((item) => {
        const fallback = periodFromDate(item.billingMonth);
        const startMonth = item.startMonth ?? fallback.month;
        const startYear = item.startYear ?? fallback.year;
        const endMonth = item.endMonth ?? fallback.month;
        const endYear = item.endYear ?? fallback.year;
        const haystack = `${item.homeowner.user.name} ${item.homeowner.block} ${item.homeowner.lot} ${item.reason} ${item.resolutionReference ?? ""} ${item.approvedBy ?? ""}`.toLowerCase();
        return <tr key={item.id} data-search={haystack}><td className="font-bold">{item.homeowner.user.name}</td><td>B{item.homeowner.block} L{item.homeowner.lot}</td><td>{monthName(startMonth)} {startYear} to {monthName(endMonth)} {endYear}</td><td>{item.reason}</td><td>{item.resolutionReference || "-"}</td><td>{item.approvedBy || item.createdBy.name}</td><td>{item.active ? "Active" : "Inactive"}</td><td><p>{shortDate(item.createdAt)}</p><p className="text-xs text-slate-400">{item.createdBy.name}</p></td><td>{item.active && <form action={deactivateBillingExemptionAction} className="flex justify-end"><input type="hidden" name="id" value={item.id} /><ConfirmSubmitButton className="btn-danger min-h-8 px-3 py-1 text-xs" message="Deactivate this exemption? Historical skip records will remain in audit logs.">Deactivate</ConfirmSubmitButton></form>}</td></tr>;
      })}{!exemptions.length && <tr><td colSpan={9} className="py-12 text-center text-slate-500">No exemptions found.</td></tr>}</tbody></table></div>
    </section>
  </>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{monthName(index + 1)}</option>);
}

function monthName(month: number) {
  return new Date(Date.UTC(2026, month - 1, 1)).toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" });
}
