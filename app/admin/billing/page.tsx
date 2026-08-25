import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { Archive, BellRing, ShieldCheck } from "lucide-react";
import { BillArchiveForm } from "@/components/bill-archive-form";
import { BillingPreviewTable } from "@/components/billing-preview-table";
import { BillingGenerationScopeFields } from "@/components/billing-generation-scope-fields";
import { BillForm } from "@/components/bill-form";
import { BillRemarks } from "@/components/bill-remarks";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton, SubmitButton } from "@/components/ui";
import { generateBillingFromPreviewAction, refreshOverdueBills } from "@/lib/actions/billing";
import { sendRemindersAction } from "@/lib/actions/content";
import { deleteDuesExemptionAction, saveDuesExemptionAction } from "@/lib/actions/exemptions";
import { prisma } from "@/lib/db";
import { billingGenerationScopes, previewBillingGeneration, type BillingGenerationInput, type BillingGenerationScope, type BillingGenerationSummary } from "@/lib/services/billing-rules";
import { money, monthLabel, shortDate } from "@/lib/utils";

type BillingQuery = Record<string, string | string[] | undefined>;

export default async function BillingPage({ searchParams }: { searchParams: Promise<BillingQuery> }) {
  const user = await refreshOverdueBills();
  const query = await searchParams;
  const edit = stringParam(query.edit);
  const generationInput = generationInputFromQuery(user, query);
  const [homeowners, bills, archivedBills, editBill, exemptions, tenant] = await Promise.all([
    prisma.homeownerProfile.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
    prisma.bill.findMany({ where: { tenantId: user.tenantId, archivedAt: null }, include: { homeowner: { include: { user: true } }, _count: { select: { payments: true, paymentRequests: true } } }, orderBy: [{ billingMonth: "desc" }, { dueDate: "desc" }] }),
    prisma.bill.findMany({ where: { tenantId: user.tenantId, archivedAt: { not: null } }, include: { homeowner: { include: { user: true } }, archivedBy: true, _count: { select: { payments: true, paymentRequests: true } } }, orderBy: { archivedAt: "desc" }, take: 50 }),
    edit ? prisma.bill.findFirst({ where: { id: edit, tenantId: user.tenantId, archivedAt: null } }) : null,
    prisma.duesExemption.findMany({ where: { tenantId: user.tenantId, active: true }, include: { homeowner: { include: { user: true } }, createdBy: true }, orderBy: [{ billingMonth: "desc" }, { homeowner: { user: { name: "asc" } } }] }),
    prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true, shortName: true, slug: true } }),
  ]);
  const blocks = [...new Set(homeowners.map((homeowner) => homeowner.block).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const phases = [...new Set(homeowners.map((homeowner) => homeowner.phase).filter((phase): phase is string => Boolean(phase)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const homeownerOptions = homeowners.map((homeowner) => ({
    id: homeowner.id,
    label: `${homeowner.user.name} - Block ${homeowner.block}, Lot ${homeowner.lot}`,
    search: `${homeowner.user.name} ${homeowner.user.email} block ${homeowner.block} lot ${homeowner.lot} account ${homeowner.id} ${homeowner.id}`.toLowerCase(),
  }));
  let preview: BillingGenerationSummary | null = null;
  let previewError = "";
  if (stringParam(query.preview) === "1") {
    try {
      preview = await previewBillingGeneration(generationInput);
    } catch (error) {
      previewError = error instanceof Error ? error.message : "Billing preview could not be generated.";
    }
  }
  return <><PageHeader eyebrow="Collections" title="Billing management" description="Generate dues, maintain bill details, and follow up outstanding accounts." action={<form action={sendRemindersAction}><SubmitButton className="btn-secondary"><BellRing className="size-4" /> Send due reminders</SubmitButton></form>} />
    {stringParam(query.error) && <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{stringParam(query.error)}</div>}
    {previewError && <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{previewError}</div>}
    <section className="card mb-6">
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <h2 className="text-lg font-black">Billing generation</h2>
          <p className="text-sm leading-6 text-slate-500">Preview first, then generate tenant-scoped monthly dues from the effective Billing Rule. Automatic scheduling remains deferred.</p>
          <p className="mt-2 text-xs font-bold uppercase tracking-wider text-pine-700">Tenant: {tenant?.name ?? user.tenant.slug}</p>
        </div>
        <Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href="/admin/settings/billing-rules">Manage billing rules</Link>
      </div>
      <form className="grid gap-4 md:grid-cols-3" method="get" action="/admin/billing">
        <input type="hidden" name="preview" value="1" />
        <div><label className="label">Coverage month</label><select className="field" name="coverageMonth" defaultValue={String(generationInput.coverageMonth)}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{monthName(index + 1)}</option>)}</select></div>
        <div><label className="label">Coverage year</label><input className="field" name="coverageYear" type="number" min="1900" max="2200" defaultValue={generationInput.coverageYear} required /></div>
        <BillingGenerationScopeFields homeowners={homeownerOptions} blocks={blocks} phases={phases} defaultScope={generationInput.scope} defaultHomeownerId={generationInput.scope === "HOMEOWNER" ? generationInput.homeownerIds?.[0] : undefined} defaultHomeownerIds={generationInput.homeownerIds ?? []} defaultBlock={generationInput.block} defaultPhase={generationInput.phase} />
        <div className="md:col-span-3"><SubmitButton>Preview Billing</SubmitButton></div>
      </form>
      {preview && <BillingPreview preview={preview} input={generationInput} tenantName={tenant?.name ?? user.tenant.slug} />}
    </section>
    <section className="mb-6 grid gap-5 xl:grid-cols-2">
      <BillForm homeowners={homeowners} bill={editBill ?? undefined} />
    </section>
    <section className="card mb-6"><div className="mb-5 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-leaf-50 text-leaf-700"><ShieldCheck className="size-5" /></span><div><h2 className="text-lg font-black">Monthly dues exemptions</h2><p className="text-sm text-slate-500">Quick-add a single-month exemption here, or manage full exemption periods in Finance settings.</p><Link className="mt-2 inline-flex text-xs font-bold text-pine-700 hover:underline" href="/admin/settings/billing-exemptions">Manage exemption periods</Link></div></div>
      <form action={saveDuesExemptionAction} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.2fr_.7fr_1.5fr_auto] xl:items-end"><div><label className="label">Homeowner</label><select className="field" name="homeownerId" required><option value="">Select homeowner</option>{homeowners.map((homeowner) => <option key={homeowner.id} value={homeowner.id}>{homeowner.user.name} - B{homeowner.block} L{homeowner.lot}</option>)}</select></div><div><label className="label">Exempt month</label><input className="field" name="billingMonth" type="month" required /></div><div><label className="label">Reason / board approval</label><input className="field" name="reason" placeholder="Example: Board Resolution No. 2026-04" required /></div><SubmitButton>Add exemption</SubmitButton></form>
      <StandardTable><div className="mt-5 overflow-x-auto rounded-xl border border-slate-200"><table className="data-table"><thead><tr><th>Homeowner</th><th>Exempt month</th><th>Reason</th><th>Approved by</th><th></th></tr></thead><tbody>{exemptions.map((item) => <tr key={item.id}><td className="font-bold">{item.homeowner.user.name}<span className="block text-xs font-normal text-slate-400">B{item.homeowner.block} L{item.homeowner.lot}</span></td><td>{monthLabel(item.billingMonth)}</td><td>{item.reason}</td><td>{item.createdBy.name}</td><td className="text-right"><form action={deleteDuesExemptionAction}><input type="hidden" name="id" value={item.id} /><DeleteButton label="Deactivate" /></form></td></tr>)}{!exemptions.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No active monthly dues exemptions recorded.</td></tr>}</tbody></table></div></StandardTable>
    </section>
    <StandardTable><div className="table-wrap"><table className="data-table"><thead><tr><th>Account</th><th>Billing month</th><th>Remarks</th><th>Due</th><th>Status</th><th>Total</th><th>Balance</th><th></th></tr></thead><tbody>
      {bills.map((bill) => <tr key={bill.id} data-search={`${bill.homeowner.user.name} ${monthLabel(bill.billingMonth)} ${bill.status} ${bill.notes ?? ""}`.toLowerCase()}><td><p className="font-bold">{bill.homeowner.user.name}</p><p className="text-xs text-slate-400">B{bill.homeowner.block} L{bill.homeowner.lot}</p></td><td>{monthLabel(bill.billingMonth)}</td><td><BillRemarks notes={bill.notes} showSource /></td><td>{shortDate(bill.dueDate)}</td><td><StatusBadge status={bill.status} /></td><td>{money(bill.totalAmount)}</td><td className="font-black">{money(bill.balance)}</td><td><div className="flex justify-end gap-2"><Link className="btn-secondary min-h-8 px-3 py-1" href={`/admin/billing?edit=${bill.id}`}>Edit</Link><BillArchiveForm id={bill.id} homeowner={bill.homeowner.user.name} billingMonth={monthLabel(bill.billingMonth)} paymentCount={bill._count.payments} requestCount={bill._count.paymentRequests} /></div></td></tr>)}
      {!bills.length && <tr><td colSpan={8} className="py-12 text-center text-slate-500">No bills yet. Generate the first monthly cycle above.</td></tr>}
    </tbody></table></div></StandardTable>
    <details className="card mt-6"><summary className="flex cursor-pointer list-none items-center gap-3 font-black"><span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><Archive className="size-4" /></span>Archived billing history <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{archivedBills.length}</span></summary><p className="mt-2 text-sm text-slate-500">Archived records stay out of active billing while preserving payments, receipts, requests, and audit history.</p><StandardTable><div className="table-wrap mt-4 shadow-none"><table className="data-table"><thead><tr><th>Account</th><th>Billing month</th><th>Paid</th><th>Balance</th><th>Related records</th><th>Archived by</th><th>Reason</th></tr></thead><tbody>{archivedBills.map((bill) => <tr key={bill.id}><td className="font-bold">{bill.homeowner.user.name}</td><td>{monthLabel(bill.billingMonth)}</td><td>{money(bill.amountPaid)}</td><td>{money(bill.balance)}</td><td className="text-xs text-slate-500">{bill._count.payments} payment(s), {bill._count.paymentRequests} request(s)</td><td><p className="font-semibold">{bill.archivedBy?.name ?? "Administrator"}</p><p className="text-xs text-slate-400">{bill.archivedAt ? shortDate(bill.archivedAt) : "-"}</p></td><td className="max-w-xs text-sm text-slate-500">{bill.archiveReason || "-"}</td></tr>)}{!archivedBills.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">No archived billing records.</td></tr>}</tbody></table></div></StandardTable></details>
  </>;
}

function BillingPreview({ preview, input, tenantName }: { preview: BillingGenerationSummary; input: BillingGenerationInput; tenantName: string }) {
  return <div className="mt-6 border-t border-slate-100 pt-5">
    {!preview.rule && <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">No effective Billing Rule configured.</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <PreviewStat label="Tenant" value={tenantName} />
      <PreviewStat label="Coverage period" value={monthLabel(preview.billingMonth)} />
      <PreviewStat label="Effective rule" value={preview.rule ? `${preview.rule.recurringChargeType.replaceAll("_", " ")} - ${preview.rule.billingFrequency}` : "No effective Billing Rule configured."} />
      <PreviewStat label="Resolution reference" value={preview.rule?.resolutionReference ?? "-"} />
      <PreviewStat label="Effective period" value={preview.rule ? rulePeriod(preview.rule) : "-"} />
      <PreviewStat label="Rule amount" value={preview.rule ? money(preview.rule.amount) : money(0)} />
      <PreviewStat label="Generation mode" value={preview.rule?.generationMode ?? "-"} />
      <PreviewStat label="Penalty configuration" value={preview.rule ? penaltyConfiguration(preview.rule) : "None"} />
      <PreviewStat label="Eligible homeowners" value={preview.eligibleCount} />
      <PreviewStat label="Exempt homeowners" value={preview.exemptCount} />
      <PreviewStat label="Duplicate bills" value={preview.duplicateCount} />
      <PreviewStat label="Invalid / skipped" value={preview.invalidCount} />
      <PreviewStat label="Projected new bills" value={preview.projectedNewBillCount} />
      <PreviewStat label="Projected total" value={money(preview.projectedTotalAmount)} />
      <PreviewStat label="Due date" value={preview.dueDate ? shortDate(preview.dueDate) : "-"} />
    </div>
    <div className="mt-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
      <div><h3 className="font-black">Preview details</h3><p className="text-sm text-slate-500">{preview.scopeLabel}</p></div>
      <form action={generateBillingFromPreviewAction}>
        <input type="hidden" name="coverageYear" value={input.coverageYear} />
        <input type="hidden" name="coverageMonth" value={input.coverageMonth} />
        <input type="hidden" name="scope" value={input.scope} />
        {input.homeownerIds?.map((id) => <input key={id} type="hidden" name="homeownerIds" value={id} />)}
        {input.scope === "HOMEOWNER" && <input type="hidden" name="homeownerId" value={input.homeownerIds?.[0] ?? ""} />}
        {input.block && <input type="hidden" name="block" value={input.block} />}
        {input.phase && <input type="hidden" name="phase" value={input.phase} />}
        <SubmitButton className="btn-primary min-h-10 px-4 py-2 text-sm">Generate for Eligible Homeowners</SubmitButton>
      </form>
    </div>
    <BillingPreviewTable rows={preview.rows} />
  </div>;
}

function PreviewStat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-800">{value}</p></div>;
}

function generationInputFromQuery(user: Awaited<ReturnType<typeof refreshOverdueBills>>, query: BillingQuery): BillingGenerationInput {
  const now = new Date();
  const scope = billingGenerationScopes.includes(stringParam(query.scope) as BillingGenerationScope) ? stringParam(query.scope) as BillingGenerationScope : "ALL";
  const coverageYear = numberParam(query.coverageYear) ?? now.getUTCFullYear();
  const coverageMonth = numberParam(query.coverageMonth) ?? now.getUTCMonth() + 1;
  const selectedIds = arrayParam(query.homeownerIds);
  const singleId = stringParam(query.homeownerId);
  return {
    actor: user,
    coverageYear,
    coverageMonth,
    scope,
    homeownerIds: scope === "HOMEOWNER" ? [singleId].filter(Boolean) : selectedIds,
    block: stringParam(query.block),
    phase: stringParam(query.phase),
  };
}

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function arrayParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function numberParam(value: string | string[] | undefined) {
  const parsed = Number(stringParam(value));
  return Number.isInteger(parsed) ? parsed : undefined;
}

function monthName(month: number) {
  return new Date(Date.UTC(2026, month - 1, 1)).toLocaleDateString("en-PH", { month: "long", timeZone: "UTC" });
}

function rulePeriod(rule: NonNullable<BillingGenerationSummary["rule"]>) {
  const start = monthYear(rule.effectiveStartYear, rule.effectiveStartMonth);
  const end = rule.effectiveEndYear === null && rule.effectiveEndMonth === null
    ? "Open Ended"
    : rule.effectiveEndYear && rule.effectiveEndMonth
      ? monthYear(rule.effectiveEndYear, rule.effectiveEndMonth)
      : "Incomplete end period";
  return `${start} to ${end}`;
}

function monthYear(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
}

function penaltyConfiguration(rule: NonNullable<BillingGenerationSummary["rule"]>) {
  if (rule.penaltyType === "NONE") return "None";
  const value = Number(rule.penaltyValue);
  const amount = rule.penaltyType === "PERCENTAGE" ? `${value}%` : money(value);
  return `${rule.penaltyType.replaceAll("_", " ")} ${amount} ${rule.penaltyFrequency === "NONE" ? "" : rule.penaltyFrequency.replaceAll("_", " ").toLowerCase()}`.trim();
}
