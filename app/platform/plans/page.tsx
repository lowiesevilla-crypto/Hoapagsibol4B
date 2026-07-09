import Link from "next/link";
import { Layers3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const planRows = [
  ["Trial", "Demo onboarding, limited duration, limited seats"],
  ["Standard", "Small HOA operations with core resident and finance tools"],
  ["Professional", "Expanded limits for growing communities"],
  ["Enterprise", "Custom limits, modules, and commercial terms"],
];

export default function PlatformPlansPage() {
  return <>
    <PageHeader eyebrow="Platform management" title="Subscription plans" description="Phase 1 placeholder for the commercial plan catalog. Database models and CRUD arrive in the next implementation phase." action={<Link className="btn-secondary" href="/platform/tenants">Back to tenants</Link>} />
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {planRows.map(([name, description]) => <article key={name} className="card">
        <span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Layers3 className="size-5" /></span>
        <h2 className="mt-4 text-lg font-black">{name}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </article>)}
    </section>
  </>;
}
