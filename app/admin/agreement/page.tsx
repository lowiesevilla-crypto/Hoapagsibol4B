import { Role, TenantAgreementStatus } from "@prisma/client";
import { Download, ExternalLink, FileSignature, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { agreementPdfUrl } from "@/lib/services/platform-agreement-document";
import {
  createTenantAgreementDraft,
  listTenantAgreements,
  tenantAgreementAdminRoleAllowed,
} from "@/lib/services/platform-agreements";

export default async function TenantAgreementCenterPage() {
  const user = await requireUser(Role.ADMIN);
  if (!tenantAgreementAdminRoleAllowed(user.roles)) redirect("/admin/subscription");
  let agreements = await listTenantAgreements(user.tenantId);
  if (!agreements.length) {
    try {
      await createTenantAgreementDraft({ tenantId: user.tenantId, actorId: user.id });
      agreements = await listTenantAgreements(user.tenantId);
    } catch {
      // A tenant without an active subscription has no agreement to generate yet.
    }
  }
  const latest = agreements[0];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-leaf-700">Account</p>
          <h1 className="text-3xl font-black text-slate-950">HOAHub Agreement</h1>
          <p className="mt-2 max-w-3xl text-slate-600">Review, electronically sign, print, and retain your Association&apos;s HOAHub software subscription agreement. Agreement records are separate from homeowner documents and HOA billing.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-pine-50 px-4 py-2 text-sm font-black text-pine-900"><ShieldCheck className="size-4" /> Secure electronic execution</span>
      </div>

      {latest && (
        <section className={`mt-6 rounded-2xl border p-5 sm:p-6 ${latest.status === TenantAgreementStatus.SIGNED ? "border-emerald-200 bg-emerald-50" : "border-blue-100 bg-blue-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">Current agreement</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">{latest.agreementNumber}</h2>
              <p className="mt-1 text-sm text-slate-600">Template v{latest.templateVersion.versionLabel} · {latest.status.replaceAll("_", " ")} · Effective {latest.effectiveDate.toLocaleDateString("en-PH")}</p>
            </div>
            <Link className="btn-primary inline-flex items-center gap-2" href={`/admin/agreement/${latest.id}`}><FileSignature className="size-4" /> Review agreement</Link>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border bg-white p-5 sm:p-6">
        <h2 className="text-xl font-black">Agreement history</h2>
        <p className="mt-1 text-sm text-slate-500">Historical signed copies remain preserved even when the subscription plan or a later master agreement version changes.</p>
        <div className="mt-5 overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-slate-50 text-left"><tr><th className="p-3">Agreement</th><th className="p-3">Effective</th><th className="p-3">Term end</th><th className="p-3">Template</th><th className="p-3">Status</th><th className="p-3">Signed</th><th className="p-3">Actions</th></tr></thead>
            <tbody>{agreements.map((agreement) => <tr key={agreement.id} className="border-t"><td className="p-3 font-black">{agreement.agreementNumber}</td><td className="p-3">{agreement.effectiveDate.toLocaleDateString("en-PH")}</td><td className="p-3">{agreement.termEndsAt?.toLocaleDateString("en-PH") || "—"}</td><td className="p-3">v{agreement.templateVersion.versionLabel}</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${agreement.status === TenantAgreementStatus.SIGNED ? "bg-emerald-100 text-emerald-800" : agreement.status === TenantAgreementStatus.DECLINED ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{agreement.status.replaceAll("_", " ")}</span></td><td className="p-3">{agreement.signedAt?.toLocaleDateString("en-PH") || "—"}</td><td className="p-3"><div className="flex flex-col items-start gap-2"><Link className="inline-flex items-center gap-1 font-black text-blue-700 hover:underline" href={`/admin/agreement/${agreement.id}`}>View / Sign <ExternalLink className="size-3" /></Link><a className="inline-flex items-center gap-1 font-black text-pine-700 hover:underline" href={agreementPdfUrl(agreement.id)}><Download className="size-3" /> Download PDF</a></div></td></tr>)}</tbody>
          </table>
        </div>
        {!agreements.length && <p className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No HOAHub subscription agreement is available yet. Platform Administration must first assign an active subscription.</p>}
      </section>
    </div>
  );
}
