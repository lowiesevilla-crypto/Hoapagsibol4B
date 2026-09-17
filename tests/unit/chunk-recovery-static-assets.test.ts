import assert from "node:assert/strict";
import test from "node:test";
import { hasFailedNextStaticResource, isChunkLoadFailure } from "../../lib/chunk-recovery";

test("detects failed Next.js chunk and css resources", () => {
  assert.equal(hasFailedNextStaticResource([
    { name: "https://hoahub.tech/_next/static/chunks/app/layout-abc.js", responseStatus: 404 },
  ]), true);
  assert.equal(hasFailedNextStaticResource([
    { name: "https://hoahub.tech/_next/static/css/app.css", responseStatus: 500 },
  ]), true);
});

test("does not classify successful or unrelated resources as stale chunks", () => {
  assert.equal(hasFailedNextStaticResource([
    { name: "https://hoahub.tech/_next/static/chunks/app/layout-abc.js", responseStatus: 200 },
    { name: "https://hoahub.tech/api/admin/homeowners", responseStatus: 404 },
  ]), false);
});

test("keeps direct chunk load error recognition", () => {
  assert.equal(isChunkLoadFailure(new Error("ChunkLoadError: Loading chunk 2972 failed")), true);
  assert.equal(isChunkLoadFailure(new Error("Cannot read properties of undefined (reading 'map')")), false);
});
