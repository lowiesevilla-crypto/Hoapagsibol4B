import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("completed PWA update reload guard is cleared on the next document", () => {
  const provider = readProjectFile("components/pwa-install-provider.tsx");
  const recovery = readProjectFile("components/browser-cache-recovery.tsx");
  const key = "hoahub:pwa-update-reload-started";

  assert.match(provider, new RegExp(`UPDATE_RELOAD_KEY = [\"']${key}[\"']`));
  assert.match(provider, /sessionStorage\.setItem\(UPDATE_RELOAD_KEY, ["']1["']\)/);
  assert.match(provider, /controllerchange/);
  assert.match(provider, /window\.location\.reload\(\)/);

  assert.match(recovery, new RegExp(`PWA_UPDATE_RELOAD_KEY = [\"']${key}[\"']`));
  assert.match(recovery, /clearCompletedPwaUpdateReloadGuard\(\);/);
  assert.match(recovery, /sessionStorage\.removeItem\(PWA_UPDATE_RELOAD_KEY\)/);

  const mountClear = recovery.indexOf("clearCompletedPwaUpdateReloadGuard();");
  const staleCacheCleanup = recovery.indexOf("void removeStaleServiceWorkerCaches();");
  assert.ok(mountClear >= 0 && staleCacheCleanup > mountClear, "reload guard must be cleared on document mount before cache cleanup");
});
