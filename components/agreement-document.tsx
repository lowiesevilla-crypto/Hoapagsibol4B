import { AgreementTemplateVersionStatus, TenantAgreementStatus } from "@prisma/client";
import type { AgreementDocument as AgreementDocumentRecord } from "@/lib/services/platform-agreement-document";

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return value.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "2-digit", timeZone: "UTC" });
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "—";
  return value.toLocaleString("en-PH", { year: "numeric", month: "long", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
}

function statusLabel(agreement: AgreementDocumentRecord) {
  if (agreement.status === TenantAgreementStatus.SIGNED) return "SIGNED ELECTRONICALLY";
  if (![AgreementTemplateVersionStatus.ACTIVE, AgreementTemplateVersionStatus.RETIRED].includes(agreement.templateVersion.status)) return "DRAFT · PENDING LEGAL APPROVAL";
  return agreement.status.replaceAll("_", " ");
}

function paragraphs(content: string) {
  return content.split(/\r?\n/).map((line) => line.trim());
}

function isMajorHeading(line: string) {
  return /^\d+\.\s+[A-Z][A-Z\s,&/-]+$/.test(line) || ["COMMERCIAL ORDER", "ELECTRONIC ACCEPTANCE", "CUSTOMER AUTHORIZED REPRESENTATIVE", "PROVIDER"].includes(line);
}

export function AgreementDocument({ agreement }: { agreement: AgreementDocumentRecord }) {
  const tenant = agreement.tenantSnapshot as Record<string, unknown>;
  const terms = agreement.termsSnapshot as Record<string, unknown>;
  const issuer = agreement.issuerSnapshot as Record<string, unknown>;
  const signed = agreement.status === TenantAgreementStatus.SIGNED;

  return (
    <article className="mx-auto max-w-[210mm] overflow-hidden bg-white shadow-xl print:max-w-none print:shadow-none">
      <header className="bg-pine-900 px-8 py-7 text-white sm:px-12 print:px-8 print:py-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-leaf-200">HOAHub Agreements</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">Software Subscription &amp; Services Agreement</h1>
            <p className="mt-2 text-sm text-cyan-100">Tenant Management &amp; HOA Digital Platform</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-black uppercase tracking-wider text-cyan-100">Agreement</p>
            <p className="mt-1 font-black">{agreement.agreementNumber}</p>
            <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${signed ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}>{statusLabel(agreement)}</span>
          </div>
        </div>
      </header>

      <div className="px-8 py-8 sm:px-12 print:px-8 print:py-6">
        <section className="grid gap-5 border-b pb-6 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Provider</p>
            <p className="mt-2 text-lg font-black text-slate-950">{String(issuer.legalName || "HOAHub")}</p>
            <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
              {String(issuer.address || "")}
              {issuer.email ? `\n${issuer.email}` : ""}
              {issuer.contactNumber ? `\n${issuer.contactNumber}` : ""}
              {issuer.tinNumber ? `\nTIN: ${String(issuer.tinNumber).replace(/^TIN\s*:\s*/i, "")}` : ""}
              {issuer.website ? `\n${issuer.website}` : ""}
            </div>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Customer / Association</p>
            <p className="mt-2 text-lg font-black text-slate-950">{String(tenant.legalBusinessName || tenant.name || "Tenant")}</p>
            <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
              {String(tenant.address || "")}
              {tenant.email ? `\n${tenant.email}` : ""}
              {tenant.contactNumber ? `\n${tenant.contactNumber}` : ""}
              {tenant.tinNumber ? `\nTIN: ${String(tenant.tinNumber).replace(/^TIN\s*:\s*/i, "")}` : ""}
              {tenant.secRegistrationNumber ? `\nRegistration: ${tenant.secRegistrationNumber}` : ""}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5 print:break-inside-avoid">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
            <Summary label="Plan" value={String(terms.planName || "—")} />
            <Summary label="Billing" value={String(terms.billingFrequency || "—").replaceAll("_", " ")} />
            <Summary label="Effective date" value={formatDate(agreement.effectiveDate)} />
            <Summary label="Term end" value={formatDate(agreement.termEndsAt)} />
          </div>
        </section>

        {!signed && agreement.templateVersion.status === AgreementTemplateVersionStatus.PENDING_LEGAL_APPROVAL && (
          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950 print:break-inside-avoid">
            This is a draft generated from template version {agreement.templateVersion.versionLabel}. Electronic signing is disabled until Platform Administration records legal review and activates this exact template version.
          </div>
        )}

        <section className="mt-8 text-[13px] leading-6 text-slate-800 print:mt-5 print:text-[10.5px] print:leading-[1.45]">
          {paragraphs(agreement.renderedContent).map((line, index) => {
            if (!line) return <div key={index} className="h-3 print:h-2" />;
            const major = isMajorHeading(line);
            if (line === "HOAHUB SOFTWARE SUBSCRIPTION AND SERVICES AGREEMENT") return null;
            return major
              ? <h2 key={index} className="mt-6 break-after-avoid text-sm font-black uppercase tracking-wide text-pine-900 print:mt-4 print:text-[11px]">{line}</h2>
              : <p key={index} className={`break-inside-avoid ${/^(Version|Agreement No\.|Plan|Billing Frequency|Subscription Fee|Discount Per Billing Cycle|Currency|Subscription Start|Initial Term|Initial Term End|Auto-Renewal|Payment Terms|Enabled Modules):/.test(line) ? "font-bold text-slate-900" : ""}`}>{line}</p>;
          })}
        </section>

        <section className={`mt-8 rounded-2xl border p-5 print:break-inside-avoid ${signed ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">Electronic execution certificate</p>
          {signed ? (
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 print:grid-cols-2">
              <Detail label="Signer" value={agreement.signerName || "Recorded signer"} />
              <Detail label="Capacity" value={agreement.signerTitle || "Recorded capacity"} />
              <Detail label="Email" value={agreement.signerEmail || "Recorded email"} />
              <Detail label="Signed" value={formatDateTime(agreement.signedAt)} />
              <Detail label="Agreement SHA-256" value={agreement.contentHash} mono />
              <Detail label="Signed record SHA-256" value={agreement.signedContentHash || "—"} mono />
              <div className="sm:col-span-2 print:col-span-2">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Authority declaration</p>
                <p className="mt-1 font-semibold text-slate-800">{agreement.authorityDeclaration}</p>
              </div>
              <div className="sm:col-span-2 print:col-span-2">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Acceptance</p>
                <p className="mt-1 text-slate-700">{agreement.acceptanceText}</p>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-600">
              This copy has not been electronically executed. Agreement integrity hash: <span className="break-all font-mono text-xs text-slate-800">{agreement.contentHash}</span>
            </div>
          )}
        </section>

        <footer className="mt-8 border-t pt-4 text-xs text-slate-500 print:mt-5">
          <div className="flex flex-wrap justify-between gap-3">
            <span>HOAHub · {agreement.agreementNumber}</span>
            <span>Template {agreement.templateVersion.versionLabel} · {agreement.templateVersion.status.replaceAll("_", " ")}</span>
          </div>
        </footer>
      </div>
    </article>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-900">{value}</p></div>;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 break-words font-semibold text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</p></div>;
}
