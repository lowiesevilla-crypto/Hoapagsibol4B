import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const roots = ["app", "components"];
const extensions = new Set([".jsx", ".tsx"]);
const files = [];
for (const root of roots) await walk(root);

let changed = 0;
for (const file of files) {
  let source = await readFile(file, "utf8");
  const repaired = source.replace(
    /<div([^>]*)><StandardTable([^>]*)>(<table\b[\s\S]*?<\/table>)<\/div><\/StandardTable>/g,
    "<StandardTable$2><div$1>$3</div></StandardTable>",
  );
  if (repaired === source) continue;
  await writeFile(file, repaired, "utf8");
  changed += 1;
  console.log(`repaired: ${file.replaceAll(path.sep, "/")}`);
}

console.log(`Repaired ${changed} file(s).`);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(target);
    else if (extensions.has(path.extname(entry.name))) files.push(target);
  }
}
