import Link from "next/link";
import type { ReactNode } from "react";

const documentSections = [
  { label: "Document Types", description: "Catalog, visibility, workflow and fee setup", href: "/admin/documents?section=types" },
  { label: "Templates", description: "Published versions, drafts and template history", href: "/admin/documents?section=templates" },
  { label: "Requests", description: "Review homeowner requests that need office action", href: "/admin/documents?section=requests" },
  { label: "Issued Documents", description: "Open the latest generated and released documents", href: "/admin/documents?section=issued" },
];

export default function AdminDocumentsLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-5">
    <section className="card print:hidden" aria-label="Document management navigation">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Document Management</p>
            <h2 className="mt-1 text-xl font-black text-slate-900">Document library and office workflow</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Move between the tenant-scoped document catalog, templates, homeowner requests and issued records without changing document-generation or approval authority.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary min-h-10 px-4 py-2 text-sm" href="/admin/documents/archive">Archive</Link>
            <Link className="btn-secondary min-h-10 px-4 py-2 text-sm" href="/admin/documents/operations">Operations</Link>
            <Link className="btn-primary min-h-10 px-4 py-2 text-sm" href="/admin/documents/new">+ Issue Document</Link>
          </div>
        </div>
        <nav className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Document management sections">
          {documentSections.map((item) => <Link key={item.href} className="group rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine-600 focus-visible:ring-offset-2" href={item.href}><span className="block text-sm font-black text-slate-900 group-hover:text-pine-800">{item.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span></Link>)}
        </nav>
      </div>
    </section>
    {children}
  </div>;
}
