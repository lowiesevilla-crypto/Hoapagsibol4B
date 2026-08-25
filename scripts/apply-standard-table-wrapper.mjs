import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const roots = ["app", "components"];
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const files = [];
const changed = [];

for (const root of roots) await walk(root);

for (const file of files.sort()) {
  const normalizedFile = file.replaceAll(path.sep, "/");
  if (isStaticOutput(normalizedFile)) continue;

  let source = await readFile(file, "utf8");
  const tableCount = source.match(/<table\b/gi)?.length ?? 0;
  if (!tableCount) continue;

  const wrapperCount = source.match(/<StandardTable\b/g)?.length ?? 0;
  if (wrapperCount >= tableCount) continue;

  const original = source;
  source = source.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => `<StandardTable>${table}</StandardTable>`);

  if (!source.includes('from "@/components/standard-table"') && !source.includes("from '@/components/standard-table'")) {
    const importLine = 'import { StandardTable } from "@/components/standard-table";\n';
    const directive = source.match(/^(\s*["']use (?:client|server)["'];\s*\n)/);
    if (directive) {
      source = `${directive[1]}${importLine}${source.slice(directive[1].length)}`;
    } else {
      source = `${importLine}${source}`;
    }
  }

  if (source !== original) {
    await writeFile(file, source, "utf8");
    changed.push(normalizedFile);
  }
}

console.log(`StandardTable rollout updated ${changed.length} file(s).`);
for (const file of changed) console.log(file);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(target);
    else if (extensions.has(path.extname(entry.name))) files.push(target);
  }
}

function isStaticOutput(file) {
  return file.includes("/print/")
    || file.startsWith("app/receipts/")
    || file.includes("/pdf/")
    || file.endsWith("/pdf/route.ts")
    || file === "components/homeowner/payments/homeowner-soa-print-document.tsx"
    || file === "app/subscription/invoice/[invoiceId]/page.tsx";
}
