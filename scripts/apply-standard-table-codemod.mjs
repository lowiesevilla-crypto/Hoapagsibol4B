import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const roots = ["app", "components"];
const extensions = new Set([".jsx", ".tsx"]);
const managedFiles = new Set([
  "components/admin-payment-sections.tsx",
  "components/billing-preview-table.tsx",
]);

const files = [];
for (const root of roots) await walk(root);

let changed = 0;
for (const file of files.sort()) {
  const normalized = file.replaceAll(path.sep, "/");
  if (isStaticOutput(normalized)) continue;
  let source = await readFile(file, "utf8");
  if (!/<table\b/i.test(source)) continue;
  const original = source;
  const managed = managedFiles.has(normalized);

  if (!source.includes('from "@/components/standard-table"')) {
    if (!managed) {
      source = source.replace(/\s*<div className="mb-4"><SearchInput\b[^>]*\/><\/div>/g, "");
      source = removeUnusedNamedImport(source, "@/components/ui", "SearchInput");
    }
    const open = managed ? '<StandardTable mode="managed">' : "<StandardTable>";
    source = source.replace(/<table\b/g, `${open}<table`);
    source = source.replace(/<\/table>/g, "</table></StandardTable>");
    source = addStandardTableImport(source);
  }

  // Keep the search bar and pagination outside horizontal scrolling containers.
  source = source.replace(
    /<div className="([^"]*(?:table-wrap|overflow-x-auto)[^"]*)"><StandardTable([^>]*)><table/g,
    '<StandardTable$2><div className="$1"><table',
  );
  source = source.replace(/<\/table><\/StandardTable><\/div>/g, "</table></div></StandardTable>");

  if (source === original) continue;
  await writeFile(file, source, "utf8");
  changed += 1;
  console.log(`${managed ? "managed" : "client"}: ${normalized}`);
}

console.log(`StandardTable codemod updated ${changed} files.`);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(target);
    else if (extensions.has(path.extname(entry.name))) files.push(target);
  }
}

function isStaticOutput(file) {
  return file.includes("/print/") || file.startsWith("app/receipts/") || file.includes("/pdf/") || file.endsWith("/pdf/route.ts");
}

function addStandardTableImport(source) {
  const statement = 'import { StandardTable } from "@/components/standard-table";\n';
  if (source.startsWith('"use client";')) return source.replace('"use client";\n', `"use client";\n\n${statement}`);
  return `${statement}${source}`;
}

function removeUnusedNamedImport(source, moduleName, identifier) {
  const importPattern = new RegExp(`import \\{([^}]+)\\} from ["']${escapeRegExp(moduleName)}["'];`);
  const match = source.match(importPattern);
  if (!match) return source;
  const withoutImport = source.replace(match[0], "");
  if (new RegExp(`\\b${identifier}\\b`).test(withoutImport)) return source;
  const names = match[1].split(",").map((item) => item.trim()).filter(Boolean).filter((item) => item !== identifier);
  const replacement = names.length ? `import { ${names.join(", ")} } from "${moduleName}";` : "";
  return source.replace(match[0], replacement);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
