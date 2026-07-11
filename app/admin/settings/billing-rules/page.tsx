import Link from "next/link";
import type { ReactNode } from "react";
import { BillingGenerationMode, BillingPenaltyFrequency, BillingPenaltyType, BillingFrequency, RecurringChargeType } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { ConfirmSubmitButton, SubmitButton } from "@/components/ui";
import { deactivateBillingRuleAction, saveBillingRuleAction } from "@/lib/actions/billing-rules";
import { requireBillingSettingsAccess } from "@/lib/billing-access";
import { prisma } from "@/lib/db";
import { findEffectiveBillingRule } from "@/lib/services/billing-rules";
import { money, shortDate } from "@/lib/utils";

export default async function BillingRulesPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string; success?: string }> }) {
  const user = await requireBillingSettingsAccess();
  const query = await searchParams;
  const today = new Date();
  const currentRule = await findEffectiveBillingRule(user.tenantId, RecurringChargeType.MONTHLY_DUES, today.getUTCFullYear(), today.getUTCMonth() + 1);
  const [rules, editRule] = await Promise.all([
    prisma.billingRule.findMany({ where: { tenantId: user.tenantId, recurringChargeType: RecurringChargeType.MONTHLY_DUES }, include: { createdBy: true, updatedBy: true }, orderBy: [{ effectiveStartYear: "desc" }, { effectiveStartMonth: "desc" }, { createdAt: "desc" }] }),
    query.edit ? prisma.billingRule.findFirst({ where: { id: query.edit, tenantId: user.tenantId, active: true } }) : null,
  ]);

  return <>
    <PageHeader eyebrow="Finance settings" title="Billing rules" description="Manage resolution-based monthly dues rates. Automatic mode is stored for Phase 2.2B; current generation remains manual." action={<Link className="btn-secondary" href="/admin/settings/billing-exemptions">Billing exemptions</Link>} />
    {query.error && <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    {query.success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Billing rule updated.</div>}

    <section className="card mb-6 border-pine-100 bg-pine-50/40">
      <p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">Current effective rule</p>
      {currentRule ? <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <Info label="Amount" value={money(currentRule.amount)} />
        <Info label="Resolution" value={currentRule.resolutionReference} />
        <Info label="Effective period" value={periodLabel(currentRule)} />
        <Info label="Generation" value={`${currentRule.generationMode} (scheduler deferred)`} />
      </div> : <p className="mt-3 text-sm font-semibold text-amber-800">No active monthly dues rule covers the current month. Add a rule before generating billing.</p>}
    </section>

    <form action={saveBillingRuleAction} className="card mb-6">
      <input type="hidden" name="id" value={editRule?.id ?? ""} />
      <input type="hidden" name="recurringChargeType" value="MONTHLY_DUES" />
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div><h2 className="text-lg font-black">{editRule ? "Edit future rule" : "Add monthly dues rule"}</h2><p className="text-sm leading-6 text-slate-500">Overlapping active periods are blocked. Historical bills keep their saved resolved rate and rule snapshot.</p></div>
        {editRule && <Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href="/admin/settings/billing-rules">Cancel edit</Link>}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Amount"><input className="field" name="amount" type="number" min="0.01" step="0.01" defaultValue={editRule ? String(editRule.amount) : ""} required /></Field>
        <Field label="Frequency"><select className="field" name="billingFrequency" defaultValue={editRule?.billingFrequency ?? BillingFrequency.MONTHLY}>{Object.values(BillingFrequency).map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></Field>
        <Field label="Generation mode"><select className="field" name="generationMode" defaultValue={editRule?.generationMode ?? BillingGenerationMode.MANUAL}>{Object.values(BillingGenerationMode).map((item) => <option key={item} value={item}>{label(item)}{item === "AUTOMATIC" ? " (Phase 2.2B)" : ""}</option>)}</select></Field>
        <Field label="Billing day"><input className="field" name="billingDay" type="number" min="1" max="28" defaultValue={editRule?.billingDay ?? 1} required /></Field>
        <Field label="Due day"><input className="field" name="dueDay" type="number" min="1" max="31" defaultValue={editRule?.dueDay ?? 15} required /></Field>
        <Field label="Grace days"><input className="field" name="gracePeriodDays" type="number" min="0" max="365" defaultValue={editRule?.gracePeriodDays ?? 0} required /></Field>
        <Field label="Penalty type"><select className="field" name="penaltyType" defaultValue={editRule?.penaltyType ?? BillingPenaltyType.NONE}>{Object.values(BillingPenaltyType).map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></Field>
        <Field label="Penalty value"><input className="field" name="penaltyValue" type="number" min="0" step="0.01" defaultValue={editRule ? String(editRule.penaltyValue) : "0"} required /></Field>
        <Field label="Penalty frequency"><select className="field" name="penaltyFrequency" defaultValue={editRule?.penaltyFrequency ?? BillingPenaltyFrequency.NONE}>{Object.values(BillingPenaltyFrequency).map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></Field>
        <Field label="Start month"><select className="field" name="effectiveStartMonth" defaultValue={editRule?.effectiveStartMonth ?? today.getUTCMonth() + 1}>{monthOptions()}</select></Field>
        <Field label="Start year"><input className="field" name="effectiveStartYear" type="number" min="1900" max="2200" defaultValue={editRule?.effectiveStartYear ?? today.getUTCFullYear()} required /></Field>
        <Field label="End month"><select className="field" name="effectiveEndMonth" defaultValue={editRule?.effectiveEndMonth ?? ""}><option value="">Open ended</option>{monthOptions()}</select></Field>
        <Field label="End year"><input className="field" name="effectiveEndYear" type="number" min="1900" max="2200" defaultValue={editRule?.effectiveEndYear ?? ""} placeholder="Open ended" /></Field>
        <Field label="Resolution reference"><input className="field" name="resolutionReference" defaultValue={editRule?.resolutionReference ?? ""} placeholder="Board Resolution No. 2026-04" required /></Field>
        <Field label="Resolution date"><input className="field" name="resolutionDate" type="date" defaultValue={editRule?.resolutionDate ? editRule.resolutionDate.toISOString().slice(0, 10) : ""} /></Field>
        <div className="md:col-span-2 xl:col-span-2"><Field label="Notes"><textarea className="field min-h-24" name="notes" defaultValue={editRule?.notes ?? ""} /></Field></div>
      </div>
      <div className="mt-5"><SubmitButton>{editRule ? "Save rule" : "Add rule"}</SubmitButton></div>
    </form>

    <section className="card p-0 sm:p-0"><div className="table-wrap rounded-none shadow-none"><table className="data-table min-w-[1100px]"><thead><tr><th>Effective period</th><th>Amount</th><th>Frequency</th><th>Generation</th><th>Penalty</th><th>Resolution</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>{rules.map((rule) => <tr key={rule.id}><td className="font-bold">{periodLabel(rule)}</td><td>{money(rule.amount)}</td><td>{label(rule.billingFrequency)}</td><td>{label(rule.generationMode)}{rule.generationMode === "AUTOMATIC" && <span className="block text-xs text-amber-700">Scheduler deferred</span>}</td><td>{label(rule.penaltyType)} {Number(rule.penaltyValue) > 0 ? money(rule.penaltyValue) : ""}</td><td><p className="font-semibold">{rule.resolutionReference}</p>{rule.resolutionDate && <p className="text-xs text-slate-400">{shortDate(rule.resolutionDate)}</p>}</td><td>{rule.active ? "Active" : "Inactive"}</td><td><p>{shortDate(rule.updatedAt)}</p><p className="text-xs text-slate-400">{rule.updatedBy?.name || rule.createdBy?.name || "System"}</p></td><td><div className="flex justify-end gap-2">{rule.active && <><Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/settings/billing-rules?edit=${rule.id}`}>Edit</Link><form action={deactivateBillingRuleAction}><input type="hidden" name="id" value={rule.id} /><ConfirmSubmitButton className="btn-danger min-h-8 px-3 py-1 text-xs" message="Deactivate this billing rule? Historical bills will remain unchanged.">Deactivate</ConfirmSubmitButton></form></>}</div></td></tr>)}{!rules.length && <tr><td colSpan={9} className="py-12 text-center text-slate-500">No billing rules configured.</td></tr>}</tbody></table></div></section>
  </>;
}

function Field({ label: labelText, children }: { label: string; children: ReactNode }) {
  return <div><label className="label">{labelText}</label>{children}</div>;
}

function Info({ label: labelText, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white p-3 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{labelText}</p><p className="mt-1 font-semibold text-slate-800">{value}</p></div>;
}

function periodLabel(rule: { effectiveStartYear: number; effectiveStartMonth: number; effectiveEndYear: number | null; effectiveEndMonth: number | null }) {
  const start = `${monthName(rule.effectiveStartMonth)} ${rule.effectiveStartYear}`;
  const end = rule.effectiveEndYear && rule.effectiveEndMonth ? `${monthName(rule.effectiveEndMonth)} ${rule.effectiveEndYear}` : "Present";
  return `${start} to ${end}`;
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{monthName(index + 1)}</option>);
}

function monthName(month: number) {
  return new Date(Date.UTC(2026, month - 1, 1)).toLocaleDateString("en-PH", { month: "long", timeZone: "UTC" });
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
