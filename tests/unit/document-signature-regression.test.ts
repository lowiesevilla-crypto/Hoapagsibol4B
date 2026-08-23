import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("documents without an explicit signatory default to the active tenant president", async () => {
  const eligibility = await source("lib/services/document-generation-eligibility.ts");
  const signatory = await source("lib/services/document-signatory.ts");

  assert.match(eligibility, /findDefaultDocumentPresident/);
  assert.match(eligibility, /request\.definition && !request\.definition\.signatoryOfficer/);
  assert.match(eligibility, /request\.definition\.signatoryOfficer = await findDefaultDocumentPresident\(context\.tenantId\)/);
  assert.match(signatory, /isPresidentPosition/);
  assert.match(signatory, /vice\|past\|former\|assistant/);
  assert.match(signatory, /homeowners association president/);
});

test("signature blocks resolve the selected officer identity and render the uploaded signature image", async () => {
  const model = await source("lib/services/document-render-model.ts");
  const renderer = await source("lib/services/document-renderers.ts");

  assert.match(model, /signatureData\?:/);
  assert.match(model, /block\.type === "signature" \? resolveSignatureData/);
  assert.match(renderer, /resolveDocumentSignatureAsset/);
  assert.match(renderer, /block\.type === "signature"/);
  assert.match(renderer, /signatureAsset\?\.signatureUrl/);
  assert.match(renderer, /electronic signature before this official document can be issued/);
});

test("optional signature blocks do not hard-block official generation", async () => {
  const renderer = await source("lib/services/document-renderers.ts");
  assert.match(renderer, /block\.required !== false/);
});
