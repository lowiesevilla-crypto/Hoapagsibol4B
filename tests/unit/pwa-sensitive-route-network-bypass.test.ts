import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("service worker does not intercept authenticated and dynamic routes", () => {
  const worker = readProjectFile("public/sw.js");

  for (const prefix of ["/api/", "/admin", "/portal", "/employee", "/platform", "/app"]) {
    assert.match(worker, new RegExp(`\\"${prefix.replaceAll("/", "\\/")}\\"`));
  }

  const sensitiveStart = worker.indexOf("if (hasSensitiveRequest(url))");
  const navigationStart = worker.indexOf('if (request.mode === "navigate")', sensitiveStart);
  assert.ok(sensitiveStart >= 0 && navigationStart > sensitiveStart, "sensitive-route guard must run before navigation caching");

  const sensitiveBlock = worker.slice(sensitiveStart, navigationStart);
  assert.match(sensitiveBlock, /return;/);
  assert.doesNotMatch(sensitiveBlock, /respondWith/);
  assert.doesNotMatch(sensitiveBlock, /fetch\(request\)/);
});
