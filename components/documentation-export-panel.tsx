import { DocumentOrigin, DocumentRequestStatus, DocumentType } from "@prisma/client";

export function DocumentationExportPanel() {
  return <section className="card">
    <div className="mb-4"><h2 className="text-xl font-black">Operational CSV export</h2><p className="text-sm text-slate-500">Export up to 10,000 tenant-scoped rows. Leave filters blank for the complete operational register.</p></div>
    <form action="/admin/documents/export" className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_180px_160px_160px_160px_auto]" method="get">
      <label><span className="label">Search</span><input className="field" name="q" type="search" maxLength={100} placeholder="Document no., homeowner, account, block, lot, purpose"/></label>
      <label><span className="label">Status</span><select className="field" name="status" defaultValue=""><option value="">All statuses</option>{Object.values(DocumentRequestStatus).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
      <label><span className="label">Document type</span><select className="field" name="type" defaultValue=""><option value="">All types</option>{Object.values(DocumentType).map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
      <label><span className="label">Origin</span><select className="field" name="origin" defaultValue=""><option value="">All origins</option>{Object.values(DocumentOrigin).map((origin) => <option key={origin} value={origin}>{origin === DocumentOrigin.ADMIN ? "Admin / walk-in" : "Homeowner portal"}</option>)}</select></label>
      <label><span className="label">From date</span><input className="field" name="from" type="date"/></label>
      <label><span className="label">To date</span><input className="field" name="to" type="date"/></label>
      <button className="btn-primary self-end">Download CSV</button>
    </form>
    <p className="mt-3 text-xs leading-5 text-slate-500">The export excludes passwords, session data, storage paths, verification tokens, generated document content, and unrelated tenant records. Treat exported homeowner and account data as confidential.</p>
  </section>;
}
