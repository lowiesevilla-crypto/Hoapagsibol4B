import { readFile, writeFile } from "node:fs/promises";

async function patch(file, transform) {
  const before = await readFile(file, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${file}: expected patch made no changes`);
  await writeFile(file, after);
  console.log(`patched ${file}`);
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`missing ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`duplicate ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

await patch("app/admin/documents/page.tsx", (source) => replaceOnce(
  source,
  'action={<Link className="btn-secondary" href="/admin/documents/archive">Archive</Link>}',
  'action={<div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/admin/documents/guide">Runbook</Link><Link className="btn-secondary" href="/admin/documents/archive">Archive</Link><Link className="btn-primary" href="/admin/documents/operations">Operations</Link></div>}',
  "admin document header actions",
));

await patch("app/portal/documents/page.tsx", (source) => replaceOnce(
  source,
  '<PageHeader eyebrow="Homeowner services" title="Document requests" description="Request, track, and download official HOA certificates and passes." />',
  '<PageHeader eyebrow="Homeowner services" title="Document requests" description="Request, track, and download official HOA certificates and passes." action={<Link className="btn-secondary" href="/portal/documents/guide">Request guide</Link>} />',
  "homeowner document guide link",
));

await patch("app/admin/documents/operations/page.tsx", (source) => {
  let next = replaceOnce(
    source,
    'import { PageHeader } from "@/components/page-header";',
    'import { DocumentationExportPanel } from "@/components/documentation-export-panel";\nimport { PageHeader } from "@/components/page-header";',
    "export panel import",
  );
  next = replaceOnce(
    next,
    '    <section className={`rounded-3xl border p-5 sm:p-7 ${readiness.productionReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>',
    '    <DocumentationExportPanel />\n\n    <section className={`rounded-3xl border p-5 sm:p-7 ${readiness.productionReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>',
    "export panel placement",
  );
  return next;
});

console.log("documentation operations links wired");
