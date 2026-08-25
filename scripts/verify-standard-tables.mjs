import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["app", "components"];
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const tablePattern = /<table\b/gi;
const standardTablePattern = /<StandardTable\b/g;

const files = [];
for (const root of roots) await walk(root);

const inventory = [];
for (const file of files.sort()) {
  const source = await readFile(file, "utf8");
  const matches = source.match(tablePattern);
  if (!matches?.length) continue;
  const normalizedFile = file.replaceAll(path.sep, "/");
  const wrapperCount = source.match(standardTablePattern)?.length ?? 0;
  inventory.push({
    file: normalizedFile,
    count: matches.length,
    wrapperCount,
    standardized: wrapperCount >= matches.length,
    staticOutput: isStaticOutput(normalizedFile),
  });
}

console.log("HOAHub repository table inventory");
console.log(`Files containing tables: ${inventory.length}`);
console.log(`Total <table> elements: ${inventory.reduce((sum, item) => sum + item.count, 0)}`);
for (const item of inventory) {
  const classification = item.staticOutput ? "STATIC_OUTPUT" : item.standardized ? "STANDARDIZED" : "INTERACTIVE_UNSTANDARDIZED";
  console.log(`${classification}\t${item.count}\t${item.wrapperCount}\t${item.file}`);
}

const violations = inventory.filter((item) => !item.staticOutput && !item.standardized);
if (violations.length) {
  console.error(`\n${violations.length} interactive table file(s) do not have StandardTable coverage for every <table> element.`);
  process.exitCode = 1;
}

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
