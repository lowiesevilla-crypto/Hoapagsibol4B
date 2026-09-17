import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const staticRoot = path.resolve(".next/static");
const releasePath = path.resolve("public/release.txt");
const outputPath = path.resolve("public/deployment-assets.json");

const release = (await readFile(releasePath, "utf8")).trim();
if (!release) throw new Error("Cannot write deployment asset manifest without public/release.txt");

const files = await walk(staticRoot);
const assets = files
  .filter((filePath) => /\.(?:js|css)$/i.test(filePath))
  .map((filePath) => `/_next/static/${filePath.split(path.sep).join("/")}`)
  .sort();

if (assets.length === 0) throw new Error("Next.js build produced no JavaScript or CSS static assets");

await writeFile(outputPath, `${JSON.stringify({ release, assets }, null, 2)}\n`, "utf8");
console.log(`Wrote ${path.relative(process.cwd(), outputPath)} for ${release} with ${assets.length} assets.`);

async function walk(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const nextRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walk(root, nextRelative));
    } else if (entry.isFile()) {
      results.push(nextRelative);
    }
  }

  return results;
}
