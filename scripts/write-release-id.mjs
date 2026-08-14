import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function resolveReleaseId() {
  const explicit = process.env.GITHUB_SHA?.trim();
  if (explicit) return explicit.slice(0, 12);

  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

const releaseId = resolveReleaseId();
const target = resolve("public/release.txt");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${releaseId}\n`, "utf8");
console.log(`Stamped HOAHub release: ${releaseId}`);
