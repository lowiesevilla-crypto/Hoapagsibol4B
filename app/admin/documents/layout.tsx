import Link from "next/link";
import type { ReactNode } from "react";

const documentSections = [
  { label: "Document Types", href: "/admin/documents?section=types" },
  { label: "Templates", href: "/admin/documents?section=templates" },
  { label: "Requests", href: "/admin/documents?section=requests&view=all" },
  { label: "Issued Documents", href: "/admin/documents?section=issued" },
];

export default function AdminDocumentsLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-5">
    <section className="card print:hidden" aria-label="Document management navigation">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Document Management</p>
          <p className="mt-1 text-sm text-slate-600">Open the document catalog, requests, issued documents, or start a Tenant Admin office issuance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <nav className="flex flex-wrap gap-2" aria-label="Document management sections">
            {documentSections.map((item) => <Link key={item.href} className="btn-secondary min-h-10 px-4 py-2 text-sm" href={item.href}>{item.label}</Link>)}
          </nav>
          <Link className="btn-primary min-h-10 px-4 py-2 text-sm" href="/admin/documents/new">+ Issue Document</Link>
        </div>
      </div>
    </section>
    {children}
  </div>;
}
