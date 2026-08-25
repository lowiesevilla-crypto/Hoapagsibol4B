import { StandardTable } from "@/components/standard-table";
import { AgreementTemplateVersionStatus, TenantAgreementStatus } from "@prisma/client";
import { FileCheck2, FileSignature, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";
import {
  activateAgreementTemplateAction,
  generateTenantAgreementAction,
} from "@/lib/actions/platform-agreements";
import { listPlatformAgreementDashboard } from "@/lib/services/platform-agreements";

export default async function PlatformAgreementsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const query = await searchParams;
  const { templates, agreements, subscriptions } = await listPlatformAgreementDashboard();
  const version = templates.flatMap((template) => template.versions).sort((a, b) => b.versionNumber - a.versionNumber)[0];
  const signed = agreements.filter((agreement) => agreement.status === TenantAgreementStatus.SIGNED).length;
  const awaiting = agreements.filter((agreement) => [TenantAgreementStatus.READY_FOR_SIGNATURE, TenantAgreementStatus.SENT, TenantAgreementStatus.VIEWED].includes(agreement.status)).length;
  const pendingLegal = version && version.status === AgreementTemplateVersionStatus.PENDING_LEGAL_APPROVAL;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-leaf-700">Commercial governance</p>
          <h1 className="text-3xl font-black text-slate-950">Subscription Agreements</h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Govern the master legal template, issue immutable tenant subscription agreements, and monitor electronic execution evidence.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-pine-50 px-4 py-2 text-sm font-black text-pine-900"><Scale className="size-4" /> Philippine-law agreement workflow</span>
      </div>

      {query.success && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{query.success}</p>}
      {query.error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{query.error}</p>}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Issued agreements" value={String(agreements.length)} icon={<FileSignature className="size-5" />} />
        <Metric label="Signed" value={String(signed)} icon={<FileCheck2 className="size-5" />} />
        <Metric label="Awaiting signature" value={String(awaiting)} icon={<ShieldCheck className="size-5" />} />
        <Metric label="Master template" value={version ? `${version.versionLabel} · ${version.status.replaceAll("_", " ")}` : "Not initialized"} icon={<Scale className="size-5" />} />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Master agreement governance</h2>
              <p className="mt-1 text-sm text-slate-500">Only an ACTIVE template version may be sent for electronic signature. Issued copies never inherit later template edits.</p>
            </div>
            {version && <span className={`rounded-full px-3 py-1 text-xs font-black ${version.status === AgreementTemplateVersionStatus.ACTIVE ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-950"}`}>{version.status.replaceAll("_", " ")}</span>}
          </div>
          {version && (
            <>
              <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <Detail label="Template" value={version.title} />
                <Detail label="Version" value={version.versionLabel} />
                <Detail label="SHA-256" value={version.contentHash} mono />
                <Detail label="Legal reviewer" value={version.legalReviewerName || "Not yet recorded"} />
              </div>
              <details className="mt-5 rounded-xl border bg-slate-50 p-4">
                <summary className="cursor-pointer font-black text-pine-900">Preview master legal draft</summary>
                <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap font-sans text-xs leading-5 text-slate-700">{version.body}</pre>
              </details>
              {pendingLegal && (
                <form action={activateAgreementTemplateAction} className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <input type="hidden" name="versionId" value={version.id} />
                  <p className="font-black text-amber-950">Legal approval required before execution</p>
                  <p className="mt-1 text-sm text-amber-900">Record the reviewer/approving authority for this exact immutable version. Activation also moves existing draft tenant agreements based on this version to READY FOR SIGNATURE.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label><span className="label">Legal reviewer / approving authority</span><input className="field" name="reviewerName" required placeholder="Full name" /></label>
                    <label><span className="label">Review notes</span><input className="field" name="reviewNotes" placeholder="Counsel review reference or approval note" /></label>
                  </div>
                  <label className="mt-4 flex items-start gap-3 text-sm font-semibold text-amber-950"><input className="mt-0.5 size-5" type="checkbox" name="confirmLegalApproval" required /><span>I confirm that I am intentionally recording legal review/approval for this exact template version and authorizing HOAHub to make it available for tenant electronic execution.</span></label>
                  <button className="btn-primary mt-4">Approve &amp; activate template v{version.versionLabel}</button>
                </form>
              )}
            </>
          )}
        </article>

        <article className="rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="text-xl font-black">Issue tenant agreement</h2>
          <p className="mt-1 text-sm text-slate-500">Generates an immutable agreement from the tenant&apos;s current subscription, billing identity, plan, price, term, modules, and HOAHub issuer profile.</p>
          <form action={generateTenantAgreementAction} className="mt-5">
            <label><span className="label">Active tenant subscription</span><select className="field" name="tenantId" required defaultValue=""><option value="" disabled>Select tenant</option>{subscriptions.map((subscription) => <option key={subscription.id} value={subscription.tenantId}>{subscription.tenant.name} · {subscription.plan.name} · {subscription.billingFrequency}</option>)}</select></label>
            <button className="btn-primary mt-4 w-full">Generate / open agreement</button>
          </form>
          <div className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-950">
            <p className="font-black">Execution control</p>
            <p className="mt-1">If the master template is still pending legal approval, HOAHub creates a viewable DRAFT only. It cannot be sent or signed until the exact template version is activated.</p>
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-black">Agreement register</h2>
          <p className="mt-1 text-sm text-slate-500">Platform-wide register of issued, signed, declined, and superseded subscription agreements.</p>
        </div>
        <div className="mt-5 overflow-auto">
          <StandardTable><table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-slate-50 text-left"><tr><th className="p-3">Agreement</th><th className="p-3">Tenant</th><th className="p-3">Plan</th><th className="p-3">Template</th><th className="p-3">Status</th><th className="p-3">Issued</th><th className="p-3">Signed</th><th className="p-3">Action</th></tr></thead>
            <tbody>{agreements.map((agreement) => {
              const tenant = agreement.tenantSnapshot as Record<string, unknown>;
              const terms = agreement.termsSnapshot as Record<string, unknown>;
              return <tr key={agreement.id} className="border-t align-top"><td className="p-3 font-black">{agreement.agreementNumber}</td><td className="p-3">{String(tenant.legalBusinessName || tenant.name || agreement.tenantId)}</td><td className="p-3">{String(terms.planName || "—")}</td><td className="p-3">v{agreement.templateVersion.versionLabel}</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${agreement.status === TenantAgreementStatus.SIGNED ? "bg-emerald-100 text-emerald-800" : agreement.status === TenantAgreementStatus.DECLINED ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{agreement.status.replaceAll("_", " ")}</span></td><td className="p-3">{agreement.createdAt.toLocaleDateString("en-PH")}</td><td className="p-3">{agreement.signedAt?.toLocaleDateString("en-PH") || "—"}</td><td className="p-3"><Link className="font-black text-blue-700 hover:underline" href={`/platform/agreements/${agreement.id}`}>View</Link></td></tr>;
            })}</tbody>
          </table></StandardTable>
        </div>
        {!agreements.length && <p className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No tenant agreements issued yet.</p>}
      </section>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <article className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><span className="text-pine-600">{icon}</span></div><p className="mt-2 break-words text-xl font-black text-pine-900">{value}</p></article>;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 break-all font-bold text-slate-800 ${mono ? "font-mono text-[11px]" : ""}`}>{value}</p></div>;
}
