import Link from "next/link";
import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const statuses = ["Trial", "Active", "Past due", "Grace period", "Suspended", "Cancelled", "Expired"];

export default function PlatformSubscriptionsPage() {
  return <>
    <PageHeader eyebrow="Platform management" title="Tenant subscriptions" description="Phase 1 placeholder for subscription status, renewal tracking, and manual account review." action={<Link className="btn-primary" href="/platform/tenants">Review tenants</Link>} />
    <section className="card">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><ListChecks className="size-5" /></span>
        <div>
          <h2 className="text-lg font-black">Subscription workspace foundation</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Future CRUD will connect tenant plans, billing cycles, renewal dates, grace periods, and payment status here.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statuses.map((status) => <div key={status} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">Status</p>
          <p className="mt-1 font-black text-pine-900">{status}</p>
        </div>)}
      </div>
    </section>
  </>;
}
