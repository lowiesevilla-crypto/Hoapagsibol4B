import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

if (process.platform !== "win32") {
  const roots = [join(process.cwd(), "node_modules", "@prisma", "engines")];
  const pnpmRoot = join(process.cwd(), "node_modules", ".pnpm");
  if (existsSync(pnpmRoot)) {
    for (const entry of readdirSync(pnpmRoot)) {
      if (entry.startsWith("@prisma+engines@")) {
        roots.push(join(pnpmRoot, entry, "node_modules", "@prisma", "engines"));
      }
    }
  }

  let repaired = 0;
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      const path = join(root, entry);
      if (!statSync(path).isFile() || !/(schema|query|migration)-engine/.test(entry)) continue;
      chmodSync(path, 0o755);
      repaired += 1;
    }
  }
  console.log(`Prepared ${repaired} Prisma engine file(s) for execution.`);
}
