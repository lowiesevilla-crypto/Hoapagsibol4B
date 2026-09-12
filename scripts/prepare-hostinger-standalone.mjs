import { cpSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const standaloneModules = join(process.cwd(), ".next", "standalone", "node_modules");

if (!existsSync(standaloneModules)) {
  throw new Error("Next.js standalone output is missing");
}

const reactDomSource = dirname(realpathSync(require.resolve("react-dom/package.json")));
const reactDomTarget = join(standaloneModules, "react-dom");
mkdirSync(reactDomTarget, { recursive: true });
cpSync(reactDomSource, reactDomTarget, { recursive: true, dereference: true });

const prismaPackage = dirname(realpathSync(require.resolve("@prisma/client/package.json")));
const prismaGeneratedSource = join(dirname(dirname(prismaPackage)), ".prisma", "client");
const prismaGeneratedTarget = join(standaloneModules, ".prisma", "client");

if (!existsSync(join(prismaGeneratedSource, "default.js"))) {
  throw new Error("Generated Prisma client is missing; run prisma generate first");
}

mkdirSync(prismaGeneratedTarget, { recursive: true });
cpSync(prismaGeneratedSource, prismaGeneratedTarget, {
  recursive: true,
  dereference: true,
});

require(join(reactDomTarget, "server.browser.js"));
require(join(standaloneModules, "@prisma", "client"));
console.log("Hostinger standalone runtime dependencies verified");
// Prisma registers process hooks when required. End this build-only verifier
// explicitly so managed builders do not wait for an idle timeout.
process.exit(0);
