import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const auditEvents = ["Tenant created", "Tenant updated", "Subscription changed", "Payment recorded", "User role changed", "Module enabled or disabled"];

export default function PlatformAuditPage() {
  return <>
    <PageHeader eyebrow="Platform management" title="Platform audit" description="Phase 1 placeholder for platform-level action history. Existing tenant audit behavior remains unchanged." action={<Link className="btn-secondary" href="/platform/tenants">Open tenants</Link>} />
    <section className="card">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><ShieldCheck className="size-5" /></span>
        <div>
          <h2 className="text-lg font-black">Audit log foundation</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">The future platform audit table will surface these SaaS-level events with actor, tenant, entity, and timestamp details.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {auditEvents.map((event) => <div key={event} className="rounded-xl border border-slate-100 bg-slate-50 p-4 font-bold text-slate-700">{event}</div>)}
      </div>
    </section>
  </>;
}
