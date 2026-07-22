import { ConfirmSubmitButton } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { restoreDocumentRequestAction } from "@/lib/actions/documents";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { documentTypeLabel } from "@/lib/services/documents";
import { shortDate } from "@/lib/utils";

export default async function DocumentArchivePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const items = await prisma.documentRequest.findMany({ where: { tenantId: user.tenantId, archivedAt: { not: null } }, include: { homeowner: { include: { user: true } }, archivedBy: true, versions: { orderBy: { version: "desc" } } }, orderBy: { archivedAt: "desc" }, take: 100 });
  return <>
    <PageHeader eyebrow="Document management" title="Document archive" description="Soft-deleted requests and every immutable generated version remain available for audit and restoration." />
    {query.error && <div className="mb-5 rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-800">{query.error}</div>}
    <div className="space-y-4">{items.map((item) => <article className="card" key={item.id}><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><h2 className="font-black">{item.documentNumber || documentTypeLabel(item.type)}</h2><p>{item.homeowner.user.name} | {documentTypeLabel(item.type)}</p><p className="text-xs text-slate-500">Archived {shortDate(item.archivedAt!)} by {item.archivedBy?.name || "Administrator"} | {item.archiveReason}</p><p className="mt-2 text-xs font-bold">Preserved versions: {item.versions.map((version) => `v${version.version}`).join(", ") || "None"}</p></div><form action={restoreDocumentRequestAction}><input type="hidden" name="id" value={item.id} /><ConfirmSubmitButton message="Restore this document request to active records?">Restore</ConfirmSubmitButton></form></div></article>)}{!items.length && <section className="card py-12 text-center text-slate-500">The document archive is empty.</section>}</div>
  </>;
}
