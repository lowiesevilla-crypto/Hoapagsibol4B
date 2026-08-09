import { AgreementTemplateVersionStatus, TenantAgreementStatus } from "@prisma/client";
import { ArrowLeft, Ban, Mail } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgreementDocument } from "@/components/agreement-document";
import { AgreementPrintActions } from "@/components/agreement-print-actions";
import { cancelPlatformAgreementAction } from "@/lib/actions/platform-agreement-cancel";
import { sendTenantAgreementAction } from "@/lib/actions/platform-agreements";
import { agreementPdfUrl } from "@/lib/services/platform-agreement-document";
import { getPlatformAgreement } from "@/lib/services/platform-agreements";

export default async function PlatformAgreementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const agreement = await getPlatformAgreement(id);
  if (!agreement) notFound();
  const canSend = agreement.templateVersion.status === AgreementTemplateVersionStatus.ACTIVE
    && [TenantAgreementStatus.READY_FOR_SIGNATURE, TenantAgreementStatus.SENT, TenantAgreementStatus.VIEWED].includes(agreement.status);
  const canCancel = ![TenantAgreementStatus.TERMINATED, TenantAgreementStatus.SUPERSEDED, TenantAgreementStatus.EXPIRED].includes(agreement.status);

  return (
    <div className="pb-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link className="inline-flex items-center gap-2 font-black text-pine-800 hover:underline" href="/platform/agreements"><ArrowLeft className="size-4" /> Agreements</Link>
        <div className="flex flex-wrap gap-2">
          {canSend && <form action={sendTenantAgreementAction}><input type="hidden" name="agreementId" value={agreement.id} /><button className="btn-secondary inline-flex items-center gap-2"><Mail className="size-4" /> Send for signature</button></form>}
          <AgreementPrintActions pdfUrl={agreementPdfUrl(agreement.id)} />
        </div>
      </div>
      {query.success && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 print:hidden">{query.success}</p>}
      {query.error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800 print:hidden">{query.error}</p>}
      <AgreementDocument agreement={agreement} />

      {canCancel && <section className="mx-auto mt-6 max-w-[210mm] rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm print:hidden">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-rose-700"><Ban className="size-5" /></span><div><h2 className="text-lg font-black text-rose-950">Cancel / terminate agreement</h2><p className="mt-1 text-sm leading-6 text-rose-900">Platform Administration can terminate this agreement without deleting its document, signature evidence, or audit history. This action does not silently delete invoices or financial records.</p></div></div>
        <form action={cancelPlatformAgreementAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <input type="hidden" name="agreementId" value={agreement.id} />
          <label><span className="label text-rose-900">Cancellation reason</span><input className="field border-rose-200 bg-white" name="reason" minLength={5} placeholder="Example: Replaced by revised commercial agreement" required /></label>
          <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-rose-700 px-5 font-black text-white hover:bg-rose-800"><Ban className="size-4" /> Cancel agreement</button>
        </form>
      </section>}

      <section className="mx-auto mt-6 max-w-[210mm] rounded-2xl border bg-white p-5 shadow-sm print:hidden">
        <h2 className="text-lg font-black">Execution audit trail</h2>
        <div className="mt-4 space-y-2">
          {agreement.auditEvents.map((event) => <div key={event.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"><div><p className="font-black">{event.eventType.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">Actor: {event.actorEmail || event.actorUserId || "System / Platform"}</p></div><p className="text-xs text-slate-500">{event.createdAt.toLocaleString("en-PH")}</p></div>)}
        </div>
      </section>
    </div>
  );
}
