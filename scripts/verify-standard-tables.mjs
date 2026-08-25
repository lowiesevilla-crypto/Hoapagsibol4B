import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["app", "components"];
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const tablePattern = /<table\b/gi;

const files = [];
for (const root of roots) await walk(root);

const inventory = [];
for (const file of files.sort()) {
  const source = await readFile(file, "utf8");
  const matches = source.match(tablePattern);
  if (!matches?.length) continue;
  inventory.push({
    file: file.replaceAll(path.sep, "/"),
    count: matches.length,
    standardized: source.includes("StandardTable"),
    staticOutput: isStaticOutput(file.replaceAll(path.sep, "/")),
  });
}

console.log("HOAHub repository table inventory");
console.log(`Files containing tables: ${inventory.length}`);
console.log(`Total <table> elements: ${inventory.reduce((sum, item) => sum + item.count, 0)}`);
for (const item of inventory) {
  const classification = item.staticOutput ? "STATIC_OUTPUT" : item.standardized ? "STANDARDIZED" : "INTERACTIVE_UNSTANDARDIZED";
  console.log(`${classification}\t${item.count}\t${item.file}`);
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
  return file.includes("/print/") || file.startsWith("app/receipts/") || file.includes("/pdf/") || file.endsWith("/pdf/route.ts");
}
