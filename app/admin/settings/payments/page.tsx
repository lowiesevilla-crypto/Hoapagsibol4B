import { CreditCard, QrCode, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { saveHomeownerPaymentSettingsAction } from "@/lib/actions/homeowner-payment-settings";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { getHomeownerPaymentConfig } from "@/lib/services/homeowner-payment-config";

export default async function HomeownerPaymentSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; message?: string }> }) {
  const admin = await requirePermission(Permission.TENANT_SETTINGS_MANAGE);
  const [config, query] = await Promise.all([getHomeownerPaymentConfig(admin.tenantId), searchParams]);

  return <>
    <PageHeader
      eyebrow="Tenant payment settings"
      title="Homeowner payment flow"
      description="Choose one payment experience for this tenant. Homeowners only see the active flow, while historical and already-pending transactions remain available for review and audit."
    />
    {query.error && <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    {query.success && <div role="status" className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{query.message || "Payment settings saved."}</div>}

    <form action={saveHomeownerPaymentSettingsAction} className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <section className="card">
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">One active flow</p>
          <h2 className="mt-1 text-xl font-black">What homeowners will use</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Changing this setting controls new payment attempts only. Existing manual submissions can still be reviewed, and PayMongo checkouts that were already created can still be confirmed by the gateway.</p>
        </div>

        <div className="grid gap-4">
          <label className={`cursor-pointer rounded-3xl border p-5 transition ${config.flow === "MANUAL_QR" ? "border-pine-300 bg-pine-50 ring-2 ring-pine-100" : "border-slate-200 bg-white"}`}>
            <div className="flex items-start gap-4">
              <input className="mt-1 size-4 accent-pine-700" type="radio" name="flow" value="MANUAL_QR" defaultChecked={config.flow === "MANUAL_QR"} />
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-100 text-pine-700"><QrCode className="size-5" /></span>
              <span className="min-w-0"><span className="block text-lg font-black text-slate-950">Manual QR & proof verification</span><span className="mt-1 block text-sm leading-6 text-slate-600">Homeowners see the tenant&apos;s official GCash QR, enter the payment reference, upload proof, and wait for an authorized tenant finance user to approve the payment.</span><span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">Existing production default</span></span>
            </div>
          </label>

          <label className={`cursor-pointer rounded-3xl border p-5 transition ${config.flow === "PAYMONGO" ? "border-blue-300 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 bg-white"}`}>
            <div className="flex items-start gap-4">
              <input className="mt-1 size-4 accent-blue-700" type="radio" name="flow" value="PAYMONGO" defaultChecked={config.flow === "PAYMONGO"} />
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-100 text-blue-700"><CreditCard className="size-5" /></span>
              <span className="min-w-0"><span className="block text-lg font-black text-slate-950">PayMongo Online</span><span className="mt-1 block text-sm leading-6 text-slate-600">Homeowners are sent to PayMongo checkout. A verified PayMongo webhook confirms the payment, then HOAHub creates the official tenant payment or collection record automatically.</span><span className="mt-2 inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-800">Requires PayMongo Platforms setup</span></span>
            </div>
          </label>
        </div>

        <div className="mt-6">
          <label className="label" htmlFor="paymongoLinkedAccountId">PayMongo linked merchant account ID</label>
          <input id="paymongoLinkedAccountId" className="field font-mono" name="paymongoLinkedAccountId" defaultValue={config.paymongoLinkedAccountId} placeholder="org_..." autoComplete="off" />
          <p className="mt-1 text-xs leading-5 text-slate-500">Tenant-specific PayMongo merchant/sub-account that receives this tenant&apos;s homeowner payment funds. Required before PayMongo Online can be activated.</p>
        </div>

        <div className="mt-6"><SubmitButton>Save homeowner payment flow</SubmitButton></div>
      </section>

      <aside className="space-y-5">
        <section className="card">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700"><ShieldCheck className="size-5" /></span><div><h2 className="font-black">Activation readiness</h2><p className="mt-1 text-sm leading-6 text-slate-600">PayMongo server credentials: <b>{config.paymongoServerConfigured ? "Configured" : "Not configured"}</b></p><p className="text-sm leading-6 text-slate-600">Linked tenant merchant: <b>{config.paymongoLinkedAccountId ? "Configured" : "Not configured"}</b></p></div></div>
          {!config.paymongoServerConfigured && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-900">PayMongo Online cannot be activated until the deployment has separate homeowner PayMongo secret and webhook credentials.</div>}
        </section>

        <section className="card border-blue-100 bg-blue-50/50">
          <h2 className="font-black text-blue-950">Tenant isolation</h2>
          <p className="mt-2 text-sm leading-6 text-blue-900">This setting is saved only for the tenant in your authenticated admin session. The homeowner portal resolves the same tenant before exposing a payment flow or accepting a payment request.</p>
        </section>
      </aside>
    </form>
  </>;
}
