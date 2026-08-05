import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";

const dailyChecklist = [
  "Open the Operations Command Center and resolve every blocking readiness item before accepting production requests.",
  "Review New submissions, Payment pending, Approval / review, Generation pending, and Returned queues.",
  "Prioritize requests in the 4–7 day and 8+ day aging bands and record clear remarks for every decision.",
  "Inspect stale generation attempts, correct the underlying configuration, then retry from the request detail page.",
  "Confirm issued documents have the correct immutable version, document number, verification state, and release status.",
];

const incidentChecklist = [
  "Do not create a duplicate request or manually edit generated HTML to bypass a failed generation attempt.",
  "Capture the request reference, document number, latest generation correlation/failure code, tenant, actor, and time.",
  "Check the assigned published template, required placeholders, signatory, numbering format, workflow steps, payment state, and balance policy.",
  "Use Retry Generation only after the blocking condition is resolved. The official engine preserves idempotency and history.",
  "For suspected cross-tenant or unauthorized access, stop processing, revoke active links when applicable, and escalate as a security incident.",
];

export default async function DocumentationAdministratorGuidePage() {
  await requireDocumentTemplateAdmin();
  return <div className="mx-auto max-w-6xl space-y-6">
    <PageHeader
      eyebrow="Documentation operations"
      title="Administrator Runbook"
      description="Production procedures for configuring, processing, recovering, exporting, and auditing HOA document requests."
      action={<div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/admin/documents/operations">Operations dashboard</Link><Link className="btn-primary" href="/admin/documents">Document workspace</Link></div>}
    />

    <section className="card border-amber-200 bg-amber-50"><h2 className="text-xl font-black text-amber-950">Production gate</h2><p className="mt-2 text-sm leading-6 text-amber-900">Do not advertise or enable a document type for production while its readiness result is Blocking. Warnings require an explicit administrator decision and should be documented in the tenant operating procedure.</p></section>

    <div className="grid gap-6 lg:grid-cols-2">
      <GuideSection title="1. Configure the catalog" items={[
        "Create or repair the Document Definition and use a stable tenant-unique code.",
        "Set homeowner/walk-in availability, subject rules, copies, delivery mode, approval, release, payment, receipt, and balance policy.",
        "Configure active request fields with clear labels, required flags, options, defaults, and validation.",
        "Use a numbering format containing a sequence token, such as {PREFIX}-{YYYY}-{SEQUENCE:6}.",
        "Assign an active organization officer when the document is a certificate, certification, clearance, or otherwise requires a signatory.",
      ]} />
      <GuideSection title="2. Publish a template" items={[
        "Create or duplicate a draft in the template workspace; never edit an immutable issued version.",
        "Use only supported placeholders and confirm each required placeholder resolves in preview.",
        "Preview the draft against representative homeowner and request data.",
        "Publish the version and assign it to the definition. Retain prior published versions for historical reproducibility.",
        "Return to the readiness checklist and verify Published template is Ready.",
      ]} />
      <GuideSection title="3. Configure workflow and payments" items={[
        "For approval-required documents, configure review/approval steps and assign an approver role or user when segregation of duties is required.",
        "For payment-required documents, set a positive fee and complete GCash account name, number, QR image, and instructions.",
        "Use Payment before approval only when the HOA policy requires payment verification before document review.",
        "Enable Receipt required only when a paid document fee is expected to produce an Other Collection receipt.",
        "Choose the outstanding-balance policy deliberately; reasoned administrator overrides remain exceptional and audited.",
      ]} />
      <GuideSection title="4. Process requests" items={[
        "Open the request from the actionable queue and verify tenant, homeowner, subject, property, purpose, snapshots, payment, and balance state.",
        "Start review, return for correction, reject with adequate remarks, or approve only when the effective rules are satisfied.",
        "Confirm processing and approving officers where required before generation.",
        "After generation, inspect the immutable version, document number, verification code, and output before release.",
        "Release, revoke, or reissue only through the official lifecycle actions so history and public verification remain correct.",
      ]} />
    </div>

    <section className="card"><h2 className="text-xl font-black">Daily operating checklist</h2><ol className="mt-4 space-y-3">{dailyChecklist.map((item, index) => <li key={item} className="grid grid-cols-[auto_1fr] gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-pine-100 font-black text-pine-900">{index + 1}</span><span className="pt-1 text-sm leading-6 text-slate-700">{item}</span></li>)}</ol></section>

    <section className="card"><h2 className="text-xl font-black">Generation recovery and incidents</h2><ol className="mt-4 space-y-3">{incidentChecklist.map((item, index) => <li key={item} className="grid grid-cols-[auto_1fr] gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-rose-100 font-black text-rose-900">{index + 1}</span><span className="pt-1 text-sm leading-6 text-slate-700">{item}</span></li>)}</ol></section>

    <div className="grid gap-6 lg:grid-cols-2">
      <GuideSection title="Archive and retention" items={[
        "Archive completed or invalid requests only with a business reason; archiving does not erase immutable versions or audit history.",
        "Restore only when continued processing is legitimate and the original tenant/homeowner relationship remains valid.",
        "Never delete issued versions, verification history, payment records, or audit events to correct an operational mistake.",
        "Use revoke/reissue for official corrections and preserve the reason and replacement chain.",
      ]} />
      <GuideSection title="Export and review" items={[
        "Use the tenant-scoped CSV export for operational reconciliation and management reporting.",
        "Apply date, status, type, origin, and search filters before export when a smaller dataset is sufficient.",
        "The export excludes credentials, storage paths, document HTML, verification tokens, and unrelated tenant data.",
        "Treat exported homeowner and account data as confidential operational information and store it under the HOA retention policy.",
      ]} />
    </div>

    <section className="card"><h2 className="text-xl font-black">Escalation data</h2><p className="mt-2 text-sm leading-6 text-slate-600">For support escalation, provide the tenant name, request reference, document number, current status, latest generation state/failure code, correlation ID when shown, expected result, actual result, actor, and exact date/time. Do not send passwords, session cookies, private verification tokens, database credentials, or full generated document content through an unsecured channel.</p></section>
  </div>;
}

function GuideSection({ title, items }: { title: string; items: string[] }) {
  return <section className="card"><h2 className="text-xl font-black">{title}</h2><ul className="mt-4 space-y-3">{items.map((item) => <li key={item} className="grid grid-cols-[auto_1fr] gap-3 text-sm leading-6 text-slate-700"><span className="mt-2 h-2 w-2 rounded-full bg-pine-600"/><span>{item}</span></li>)}</ul></section>;
}
