import Link from "next/link";
import { requireAnyPermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import {
  acknowledgeOnboardingPrivacyAction,
  applyOnboardingImportAction,
  completeTenantOnboardingAction,
  previewOnboardingBillingAction,
  saveOnboardingBillingRuleAction,
  saveOnboardingProfileAction,
  validateOnboardingImportAction,
} from "@/lib/actions/onboarding";
import { ONBOARDING_HOMEOWNER_BATCH_SIZE } from "@/lib/onboarding/csv";
import { getTenantOnboardingState, onboardingPrerequisites } from "@/lib/onboarding/state";
import { PageHeader } from "@/components/page-header";

export default async function TenantOnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireAnyPermission([
    Permission.TENANT_SETTINGS_MANAGE,
    Permission.HOMEOWNERS_MANAGE,
    Permission.BILLING_CONFIGURE,
    Permission.BILLING_PREVIEW,
  ]);
  const [tenant, state, params, initialAdmins, homeownerCount] = await Promise.all([
    prisma.tenant.findFirst({ where: { id: actor.tenantId }, select: { id: true, name: true, shortName: true, slug: true, address: true, email: true, contactNumber: true } }),
    getTenantOnboardingState(actor.tenantId),
    searchParams,
    prisma.user.count({ where: { tenantId: actor.tenantId, active: true, userRoleAssignments: { some: { active: true, role: { in: ["HOA_ADMIN", "ADMIN", "SYSTEM_ADMIN"] } } } } }),
    prisma.homeownerProfile.count({ where: { tenantId: actor.tenantId } }),
  ]);
  if (!tenant) throw new Error("Tenant not found.");
  const prerequisites = onboardingPrerequisites(state);
  const message = typeof params.message === "string" ? params.message : null;
  const defaultMonth = state.billing?.effectiveFrom ?? new Date().toISOString().slice(0, 7);

  return <>
    <PageHeader
      eyebrow="Tenant setup"
      title="Onboarding and first billing preview"
      description="Configure the HOA, acknowledge data responsibilities, import activation-only homeowner accounts, define monthly dues, and preview the first billing cycle. Billing generation is always a separate authorized action."
      action={<Link className="btn-secondary" href="/admin">Back to dashboard</Link>}
    />

    {message ? <div className="mb-6 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm" role="status">{message}</div> : null}

    <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Onboarding progress">
      <Progress label="Profile" complete={prerequisites.profile} />
      <Progress label="Privacy" complete={prerequisites.privacy} />
      <Progress label="Import" complete={prerequisites.import} />
      <Progress label="Billing" complete={prerequisites.billing} />
      <Progress label="Preview" complete={prerequisites.preview} />
    </section>

    <div className="space-y-6">
      <WizardCard number="1" title="Tenant identity and operational defaults" complete={prerequisites.profile}>
        <p className="mb-4 text-sm text-slate-600">Tenant slug: <strong>{tenant.slug}</strong>. Active initial administrators: <strong>{initialAdmins}</strong>.</p>
        <form action={saveOnboardingProfileAction} className="grid gap-4 md:grid-cols-2">
          <Field label="HOA name" name="name" defaultValue={tenant.name} required />
          <Field label="Short name" name="shortName" defaultValue={tenant.shortName} required />
          <Field label="Support email" name="supportEmail" type="email" defaultValue={state.profile?.supportEmail ?? tenant.email ?? ""} />
          <Field label="Support phone" name="supportPhone" defaultValue={state.profile?.supportPhone ?? tenant.contactNumber ?? ""} />
          <Field label="Timezone" name="timezone" defaultValue={state.profile?.timezone ?? "Asia/Manila"} required />
          <Field label="Currency" name="currency" defaultValue={state.profile?.currency ?? "PHP"} required maxLength={3} />
          <Field label="Receipt prefix" name="receiptPrefix" defaultValue={state.profile?.receiptPrefix ?? "OR"} required />
          <Field label="Document prefix" name="documentPrefix" defaultValue={state.profile?.documentPrefix ?? "DOC"} required />
          <label className="md:col-span-2"><span className="mb-1 block text-sm font-medium">HOA address</span><textarea className="input min-h-24" name="address" defaultValue={tenant.address ?? ""} /></label>
          <div className="md:col-span-2"><button className="btn-primary" type="submit">Save profile defaults</button></div>
        </form>
      </WizardCard>

      <WizardCard number="2" title="Privacy and data-handling responsibilities" complete={prerequisites.privacy}>
        <form action={acknowledgeOnboardingPrivacyAction} className="space-y-3">
          <Check name="dataControllerAccepted" defaultChecked={state.privacy?.dataControllerAccepted}>The HOA accepts responsibility as the authorized controller of resident and property data submitted to HOAHub.</Check>
          <Check name="secureHandlingAccepted" defaultChecked={state.privacy?.secureHandlingAccepted}>Uploaded data will be obtained, reviewed, retained, and shared only through approved secure processes.</Check>
          <Check name="importAuthorizationAccepted" defaultChecked={state.privacy?.importAuthorizationAccepted}>The signer is authorized to import these homeowner, property, account-number, and opening-balance records.</Check>
          <button className="btn-primary" type="submit">Record acknowledgement</button>
        </form>
      </WizardCard>

      <WizardCard number="3" title="Validate and import homeowners" complete={prerequisites.import}>
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <Link className="btn-secondary" href="/admin/onboarding/template">Download CSV template v2.0</Link>
          {state.import?.errors.length ? <Link className="btn-secondary" href="/admin/onboarding/errors">Download validation errors</Link> : null}
        </div>
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p className="font-semibold">Large community import: use consecutive safe batches.</p>
          <p className="mt-1">Each CSV may contain up to <strong>{ONBOARDING_HOMEOWNER_BATCH_SIZE} homeowners</strong>. After a batch is validated and applied, return to A and validate the next batch. Applied homeowners remain saved. For 2,050 homeowners, use five files: 500 + 500 + 500 + 500 + 50.</p>
          <p className="mt-2">Homeowner records currently in HOAHub for this tenant: <strong>{homeownerCount}</strong>.</p>
        </div>
        <p className="mb-4 text-sm text-slate-600">The template never accepts passwords. Imported homeowners receive unique account numbers and expiring activation credentials. Raw CSV content is not retained after each request. The per-batch limit protects the transactional import and activation workflow from long-running requests; do not combine multiple batches into one file.</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <form action={validateOnboardingImportAction} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold">A. Dry-run validation</h3>
            <p className="text-xs text-slate-500">Validate one batch (maximum {ONBOARDING_HOMEOWNER_BATCH_SIZE} rows). You can start the next batch here immediately after applying the previous one.</p>
            <input className="input" type="file" name="file" accept=".csv,text/csv" required />
            <button className="btn-primary" type="submit">Validate without writing</button>
          </form>
          <form action={applyOnboardingImportAction} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold">B. Apply the unchanged file</h3>
            <p className="text-sm text-slate-600">Validated rows: <strong>{state.import?.validRows ?? 0}</strong>. Errors: <strong>{state.import?.errors.length ?? 0}</strong>.</p>
            <input type="hidden" name="expectedFileHash" value={state.import?.errors.length ? "" : state.import?.fileHash ?? ""} />
            <input className="input" type="file" name="file" accept=".csv,text/csv" required disabled={!state.import || state.import.errors.length > 0 || Boolean(state.import.appliedAt)} />
            <Check name="confirmApply" disabled={!state.import || state.import.errors.length > 0 || Boolean(state.import.appliedAt)}>I confirm this is the exact validated file and authorize transactional creation of activation-only accounts and any declared opening balances.</Check>
            <button className="btn-primary" type="submit" disabled={!state.import || state.import.errors.length > 0 || Boolean(state.import.appliedAt)}>Apply import</button>
            {state.import?.appliedAt ? <div className="space-y-1 text-sm font-medium text-emerald-700"><p>Applied {state.import.importedRows} rows; {state.import.openingBalancesPosted} opening balances.</p><p>This batch is complete. Upload the next batch in A; successful prior batches stay saved.</p></div> : null}
          </form>
        </div>
        {state.import?.errors.length ? <div className="mt-4 max-h-64 overflow-auto rounded-xl bg-rose-50 p-4 text-sm text-rose-900"><ul className="space-y-1">{state.import.errors.slice(0, 20).map((error, index) => <li key={`${error.rowNumber}-${error.field}-${index}`}>Row {error.rowNumber ?? "file"}{error.field ? `, ${error.field}` : ""}: {error.message}</li>)}</ul>{state.import.errors.length > 20 ? <p className="mt-2">Download the error CSV for the complete list.</p> : null}</div> : null}
      </WizardCard>

      <WizardCard number="4" title="Monthly dues configuration" complete={prerequisites.billing}>
        <form action={saveOnboardingBillingRuleAction} className="grid gap-4 md:grid-cols-2">
          <Field label="Monthly dues amount" name="monthlyAmount" type="number" min="0.01" step="0.01" defaultValue={state.billing?.monthlyAmount ?? 500} required />
          <Field label="Due day (1-28)" name="dueDay" type="number" min="1" max="28" defaultValue={state.billing?.dueDay ?? 15} required />
          <Field label="Effective month" name="effectiveFrom" type="month" defaultValue={state.billing?.effectiveFrom ?? defaultMonth} required />
          <label><span className="mb-1 block text-sm font-medium">Rule description / authority</span><textarea className="input min-h-24" name="description" defaultValue={state.billing?.description ?? "Initial monthly dues rule configured during tenant onboarding."} required /></label>
          <div className="md:col-span-2"><button className="btn-primary" type="submit">Save manual billing rule</button></div>
        </form>
      </WizardCard>

      <WizardCard number="5" title="First billing preview" complete={prerequisites.preview}>
        <form action={previewOnboardingBillingAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Preview month" name="targetMonth" type="month" defaultValue={state.preview ? `${state.preview.year}-${String(state.preview.month).padStart(2, "0")}` : defaultMonth} required />
          <button className="btn-primary" type="submit">Run preview only</button>
        </form>
        {state.preview ? <div className="mt-4 grid gap-3 sm:grid-cols-4"><Metric label="Eligible" value={state.preview.eligible} /><Metric label="Skipped" value={state.preview.skipped} /><Metric label="Errors" value={state.preview.errors} /><Metric label="Projected total" value={`PHP ${state.preview.totalAmount.toFixed(2)}`} /></div> : null}
        <p className="mt-3 text-sm font-medium text-amber-800">Preview never generates bills. Generation requires a separate authorized action from the Billing module.</p>
      </WizardCard>

      <WizardCard number="6" title="Completion checklist" complete={Boolean(state.completedAt)}>
        <ul className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(prerequisites).map(([label, complete]) => <li key={label} className={complete ? "text-emerald-700" : "text-slate-500"}>{complete ? "✓" : "○"} {label}</li>)}
        </ul>
        <form action={completeTenantOnboardingAction} className="space-y-3">
          <Check name="confirmComplete" disabled={!Object.values(prerequisites).every(Boolean)}>I reviewed the configuration, import summary, billing rule, and non-persistent preview.</Check>
          <button className="btn-primary" type="submit" disabled={!Object.values(prerequisites).every(Boolean)}>Complete onboarding</button>
        </form>
        {state.completedAt ? <p className="mt-3 text-sm font-semibold text-emerald-700">Completed on {new Date(state.completedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}.</p> : null}
      </WizardCard>
    </div>
  </>;
}

function WizardCard({ number, title, complete, children }: { number: string; title: string; complete: boolean; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold"><span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm text-white">{number}</span>{title}</h2><span className={complete ? "text-sm font-semibold text-emerald-700" : "text-sm text-slate-500"}>{complete ? "Complete" : "Pending"}</span></div>
    {children}
  </section>;
}

function Progress({ label, complete }: { label: string; complete: boolean }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${complete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>{complete ? "✓" : "○"} {label}</div>;
}

function Field({ label, name, ...props }: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label><span className="mb-1 block text-sm font-medium">{label}</span><input className="input" name={name} {...props} /></label>;
}

function Check({ name, children, ...props }: { name: string; children: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" name={name} {...props} /><span>{children}</span></label>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>;
}
