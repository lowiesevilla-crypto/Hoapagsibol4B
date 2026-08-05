import { readFile, writeFile } from "node:fs/promises";

const file = "app/admin/documents/operations/page.tsx";
const before = await readFile(file, "utf8");
let after = before.replace("  DocumentRequestStatus,\n  DocumentTemplateVersionStatus,\n", "  DocumentRequestStatus,\n");
after = after.replace('<a className="btn-secondary" href="/admin/documents/export">Export CSV</a>', '<Link className="btn-secondary" href="/admin/documents/export">Export CSV</Link>');
if (after === before) throw new Error("Expected documentation lint fixes were not applied.");
await writeFile(file, after);
console.log("documentation lint fixes applied");
