import Link from "next/link";
import { Role } from "@prisma/client";
import { RequestAreaNavigation } from "@/components/homeowner/requests/request-cards";
import { PageHeader } from "@/components/page-header";
import { PortalPageContainer } from "@/components/portal-mobile-shell";
import { requireUser } from "@/lib/auth";

export default async function HomeownerDocumentGuidePage() {
  await requireUser(Role.HOMEOWNER);
  return <PortalPageContainer className="space-y-6">
    <RequestAreaNavigation active="documents" />
    <PageHeader
      eyebrow="Homeowner services"
      title="Document Request Guide"
      description="How to request, correct, pay for, track, download, and verify official HOA documents."
      action={<Link className="btn-primary" href="/portal/documents">Open document requests</Link>}
    />

    <section className="card border-blue-200 bg-blue-50"><h2 className="text-lg font-black text-blue-950">Before you start</h2><p className="mt-2 text-sm leading-6 text-blue-900">Confirm that your homeowner profile, property information, email, and household members are correct. Available document types, fees, approvals, download rules, and balance restrictions are configured by your HOA.</p></section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Step number="1" title="Choose a document" text="Review the description, fee, approval, payment, delivery, subject, and copy limits shown in the request form." />
      <Step number="2" title="Complete the request" text="Select yourself or an eligible household member, enter the purpose, complete required fields, and review the details before submitting." />
      <Step number="3" title="Pay or correct" text="When payment is required, use the saved document fee and submit proof through Pay by QR. When returned, correct and resubmit the same request." />
      <Step number="4" title="Track and download" text="Follow the status tracker. View or download only after the official document is generated, released when required, and allowed by HOA policy." />
    </section>

    <div className="grid gap-6 lg:grid-cols-2">
      <GuideSection title="Requesting for a household member" items={[
        "Add the person under Household and family members before starting the request.",
        "Use the member's complete legal name and correct relationship.",
        "Some document types may require date of birth, civil status, nationality, or a different address.",
        "Inactive or ineligible members cannot be selected. Contact the HOA when the eligibility message is incorrect.",
      ]} />
      <GuideSection title="Document fees" items={[
        "The amount shown on the request is the official saved document fee. Do not edit or round it.",
        "Verify the HOA GCash account name and number before sending payment.",
        "Submit the reference number and required proof only once. A submitted payment waits for Finance verification.",
        "A rejected payment can be corrected and resubmitted. The document proceeds only after the required payment is confirmed.",
      ]} />
      <GuideSection title="Status meanings" items={[
        "Submitted / Pending Approval: the HOA has received the request and it is waiting for review or approval.",
        "Payment Pending: complete or correct the document fee payment.",
        "Under Review: HOA staff are checking the request and effective document rules.",
        "Returned for Correction: update the requested information and resubmit the same request.",
        "Generating: the official engine is creating the document; do not submit a duplicate request.",
        "Issued / Ready / Generated: the document exists; release, payment, or balance rules may still control download.",
        "Rejected / Cancelled / Revoked: read the remarks and contact the HOA when clarification is needed.",
      ]} />
      <GuideSection title="Balance and download rules" items={[
        "Some document types allow requests but block download while qualifying HOA balances remain unpaid.",
        "Some document types block the request itself when a qualifying balance exists.",
        "An administrator override is exceptional, requires a reason, and may not be permitted by the saved policy.",
        "Paying a balance does not instantly change a document status until the relevant payment is posted and the page is refreshed.",
      ]} />
    </div>

    <section className="card"><h2 className="text-xl font-black">Viewing, downloading, printing, and verification</h2><ul className="mt-4 space-y-3">{[
      "Use View Document to inspect the generated version in the portal.",
      "Use Download or Print only when the action is shown. The system checks tenant, homeowner ownership, release state, payment, balance, revocation, and document policy on the server.",
      "The QR code or verification reference confirms authenticity through the public verification page. It does not expose your private request data.",
      "A revoked version must not be used as a valid HOA document. A reissued version has its own immutable version and verification state.",
      "Save the downloaded document securely. It may contain personal and property information.",
    ].map((item) => <li key={item} className="grid grid-cols-[auto_1fr] gap-3 text-sm leading-6 text-slate-700"><span className="mt-2 h-2 w-2 rounded-full bg-pine-600"/><span>{item}</span></li>)}</ul></section>

    <section className="card border-amber-200 bg-amber-50"><h2 className="text-xl font-black text-amber-950">When to contact the HOA</h2><p className="mt-2 text-sm leading-6 text-amber-900">Contact the HOA office when your profile or property is incorrect, an eligible household member cannot be selected, payment remains unreviewed, a request is returned without clear remarks, generation shows an error for an extended period, or a released document contains incorrect official information. Provide the request reference shown in your history; never share your password or session information.</p></section>
  </PortalPageContainer>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <article className="card"><span className="grid h-10 w-10 place-items-center rounded-full bg-pine-100 text-lg font-black text-pine-900">{number}</span><h2 className="mt-4 text-lg font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>;
}

function GuideSection({ title, items }: { title: string; items: string[] }) {
  return <section className="card"><h2 className="text-xl font-black">{title}</h2><ul className="mt-4 space-y-3">{items.map((item) => <li key={item} className="grid grid-cols-[auto_1fr] gap-3 text-sm leading-6 text-slate-700"><span className="mt-2 h-2 w-2 rounded-full bg-pine-600"/><span>{item}</span></li>)}</ul></section>;
}
