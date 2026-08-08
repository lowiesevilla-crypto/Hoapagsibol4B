import { AgreementTemplateVersionStatus, Role, TenantAgreementStatus } from "@prisma/client";
import { ArrowLeft, KeyRound, PenLine, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AgreementDocument } from "@/components/agreement-document";
import { AgreementPrintActions } from "@/components/agreement-print-actions";
import {
  declineAgreementAction,
  requestAgreementOtpAction,
  signAgreementAction,
} from "@/lib/actions/platform-agreements";
import { requireUser } from "@/lib/auth";
import { agreementPdfUrl } from "@/lib/services/platform-agreement-document";
import {
  getTenantAgreement,
  recordAgreementViewed,
  tenantAgreementAdminRoleAllowed,
  tenantAgreementSigningAllowed,
} from "@/lib/services/platform-agreements";

export default async function TenantAgreementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await requireUser(Role.ADMIN);
  if (!tenantAgreementAdminRoleAllowed(user.roles)) redirect("/admin/subscription");
  const { id } = await params;
  const query = await searchParams;
  let agreement = await getTenantAgreement(user.tenantId, id);
  if (!agreement) notFound();

  const requestHeaders = await headers();
  await recordAgreementViewed({
    agreementId: agreement.id,
    tenantId: user.tenantId,
    actorUserId: user.id,
    actorEmail: user.email,
    metadata: {
      ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || null,
      userAgent: requestHeaders.get("user-agent") || null,
    },
  }).catch(() => undefined);
  agreement = await getTenantAgreement(user.tenantId, id) || agreement;

  const signingAllowed = tenantAgreementSigningAllowed(agreement.status)
    && [AgreementTemplateVersionStatus.ACTIVE, AgreementTemplateVersionStatus.RETIRED].includes(agreement.templateVersion.status);
  const signed = agreement.status === TenantAgreementStatus.SIGNED;

  return (
    <div className="pb-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link className="inline-flex items-center gap-2 font-black text-pine-800 hover:underline" href="/admin/agreement"><ArrowLeft className="size-4" /> HOAHub Agreement</Link>
        <AgreementPrintActions pdfUrl={agreementPdfUrl(agreement.id)} />
      </div>
      {query.success && <p className="mx-auto mb-4 max-w-[210mm] rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 print:hidden">{query.success}</p>}
      {query.error && <p className="mx-auto mb-4 max-w-[210mm] rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800 print:hidden">{query.error}</p>}

      <AgreementDocument agreement={agreement} />

      {signingAllowed && !signed && (
        <section className="mx-auto mt-6 max-w-[210mm] rounded-2xl border border-blue-200 bg-white p-5 shadow-sm sm:p-6 print:hidden">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-6 text-blue-700" />
            <div>
              <h2 className="text-xl font-black text-slate-950">Electronic acceptance</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Only an authorized Association representative should sign. HOAHub will bind this authenticated account, a one-time email verification code, the typed signature, authority declaration, timestamp, network/device metadata, and document hashes into the execution audit trail.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
            <form action={requestAgreementOtpAction} className="rounded-xl bg-slate-50 p-4">
              <input type="hidden" name="agreementId" value={agreement.id} />
              <p className="flex items-center gap-2 font-black"><KeyRound className="size-4" /> Step 1 · Verify email</p>
              <p className="mt-2 text-sm text-slate-600">A six-digit code will be sent to your authenticated HOAHub email: <strong>{user.email}</strong>. Codes expire after 10 minutes.</p>
              <button className="btn-secondary mt-4 w-full">Send verification code</button>
            </form>

            <form action={signAgreementAction} className="rounded-xl border p-4">
              <input type="hidden" name="agreementId" value={agreement.id} />
              <p className="flex items-center gap-2 font-black"><PenLine className="size-4" /> Step 2 · Sign agreement</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label><span className="label">Full legal name</span><input className="field" name="signerName" defaultValue={user.name} required autoComplete="name" /></label>
                <label><span className="label">Title / capacity</span><input className="field" name="signerTitle" required placeholder="e.g. HOA President / Authorized Representative" /></label>
                <label className="sm:col-span-2"><span className="label">Six-digit verification code</span><input className="field font-mono tracking-[0.25em]" name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" /></label>
              </div>
              <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-0.5 size-5" type="checkbox" name="acceptedTerms" required /><span>I have reviewed the complete HOAHub Software Subscription and Services Agreement and agree to be bound by its terms on behalf of the Customer.</span></label>
              <label className="mt-3 flex items-start gap-3 text-sm"><input className="mt-0.5 size-5" type="checkbox" name="confirmedAuthority" required /><span>I represent that I am authorized to bind the Association identified in this Agreement and intend my typed name and verified acceptance to serve as my electronic signature.</span></label>
              <button className="btn-primary mt-5 w-full">Sign agreement electronically</button>
            </form>
          </div>

          <details className="mt-5 rounded-xl border border-rose-100 bg-rose-50 p-4">
            <summary className="cursor-pointer font-black text-rose-900">I cannot accept these terms</summary>
            <form action={declineAgreementAction} className="mt-4">
              <input type="hidden" name="agreementId" value={agreement.id} />
              <label><span className="label">Reason for declining</span><textarea className="field min-h-24" name="reason" required placeholder="Describe the term or commercial issue that Platform Administration should review." /></label>
              <button className="mt-3 rounded-lg bg-rose-700 px-4 py-2 font-black text-white">Decline agreement</button>
            </form>
          </details>
        </section>
      )}

      {agreement.status === TenantAgreementStatus.DRAFT && (
        <section className="mx-auto mt-6 max-w-[210mm] rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 print:hidden">
          <p className="font-black">Draft only — electronic signing is locked</p>
          <p className="mt-1">Platform Administration must complete legal-template review and activate this exact template version before HOAHub can accept an electronic signature.</p>
        </section>
      )}

      {signed && (
        <section className="mx-auto mt-6 max-w-[210mm] rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 print:hidden">
          <p className="font-black">Executed agreement</p>
          <p className="mt-1">This agreement was electronically signed on {agreement.signedAt?.toLocaleString("en-PH")}. The issued contract text and signed execution hashes are now preserved as immutable evidence.</p>
        </section>
      )}
    </div>
  );
}
