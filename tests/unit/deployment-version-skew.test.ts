import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isChunkLoadFailure } from "../../lib/chunk-recovery";

const nextConfigPath = new URL("../../next.config.ts", import.meta.url);

test("self-hosted builds use the stamped release for deployment skew protection", async () => {
  const source = await readFile(nextConfigPath, "utf8");
  assert.match(source, /public\/release\.txt/);
  assert.match(source, /deploymentId:\s*deploymentVersion/);
  assert.match(source, /generateBuildId:\s*async \(\) => deploymentVersion/);
});

test("global recovery recognizes stale Server Action deployment failures", () => {
  assert.equal(isChunkLoadFailure(new Error("Failed to find Server Action abc123")), true);
  assert.equal(isChunkLoadFailure(new Error("This request might be from an older or newer deployment")), true);
  assert.equal(isChunkLoadFailure(new Error("ordinary validation failure")), false);
});
