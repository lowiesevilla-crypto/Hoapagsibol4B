import Link from "next/link";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const controls = ["Maximum users", "Maximum homeowners", "Storage limits", "Enabled modules", "Trial expiration", "Grace period"];

export default function PlatformLicensesPage() {
  return <>
    <PageHeader eyebrow="Platform management" title="License controls" description="Phase 1 placeholder for plan limits and tenant access controls. Enforcement remains unchanged until the backend phase." action={<Link className="btn-secondary" href="/platform/tenants">Tenant management</Link>} />
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {controls.map((control) => <article key={control} className="card">
        <span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><KeyRound className="size-5" /></span>
        <h2 className="mt-4 text-lg font-black">{control}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Reserved for Phase 2 data model and validation wiring.</p>
      </article>)}
    </section>
  </>;
}
