import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("generated definition documents reissue through the canonical visual renderer", async () => {
  const reissue = await source("lib/actions/document-reissue.ts");
  const controls = await source("components/document-review-actions.tsx");
  const generation = await source("lib/services/document-generation.ts");
  const renderer = await source("lib/services/document-renderers.ts");

  assert.match(controls, /formAction=\{reissueGeneratedDocumentAction\}/);
  assert.match(controls, /Save & reissue using template/);
  assert.match(reissue, /generateDocument\(documentContextFromUser\(admin\), request\.id/);
  assert.match(reissue, /mode: DocumentGenerationMode\.REISSUE/);
  assert.match(reissue, /reissueOfVersionId: currentVersion\.id/);
  assert.match(reissue, /captured published visual template/);
  assert.doesNotMatch(reissue, /renderDocumentTemplate/);
  assert.doesNotMatch(reissue, /renderTemplateDefinitionText/);
  assert.match(generation, /generatedContent: renderedContent/);
  assert.match(generation, /rendererName: rendered\.rendererName/);
  assert.match(renderer, /name: "hoahub-safe-html"/);
});

test("admin and homeowner first issuance both enter the canonical workflow engine", async () => {
  const actions = await source("lib/actions/documents.ts");
  const executor = await source("lib/services/document-workflow-executor.ts");

  const adminStart = actions.indexOf("export async function generateManualDocumentAction");
  const adminEnd = actions.indexOf("export async function retryDocumentGenerationAction", adminStart);
  assert.ok(adminStart >= 0 && adminEnd > adminStart);
  assert.match(actions.slice(adminStart, adminEnd), /executeDocumentWorkflowAfterSubmission\(context, request\.id\)/);

  const homeownerStart = actions.indexOf("async function submitDocumentRequest");
  const homeownerEnd = actions.indexOf("export async function processDocumentRequestAction", homeownerStart);
  assert.ok(homeownerStart >= 0 && homeownerEnd > homeownerStart);
  assert.match(actions.slice(homeownerStart, homeownerEnd), /executeDocumentWorkflowAfterSubmission\(context, request\.id\)/);

  assert.match(executor, /issueOfficialDocument/);
  assert.match(executor, /generateDocument\(context, request\.id/);
});

test("shared issued-document viewer reads the current immutable version", async () => {
  const page = await source("app/documents/[id]/page.tsx");

  assert.match(page, /const currentVersion = request\.versions\[0\] \?\? null/);
  assert.match(page, /currentVersion\?\.generatedContent \|\| request\.generatedContent/);
  assert.match(page, /buildSelfContainedDocumentAssets\(renderedContent/);
});

test("definition-backed print never falls through to the legacy clearance sheet", async () => {
  const printPage = await source("app/documents/[id]/print/page.tsx");

  assert.match(printPage, /currentVersion && \(request\.definition \|\| currentVersion\.rendererName === "hoahub-safe-html"\)/);
  assert.match(printPage, /getIssuedDocumentRenderSource\(id/);
  assert.match(printPage, /renderIssuedDocumentPrintHtml\(source\)/);

  const canonicalGuard = printPage.indexOf("currentVersion && (request.definition || currentVersion.rendererName");
  const clearanceFallback = printPage.indexOf("<ClearanceSheet", canonicalGuard);
  assert.ok(canonicalGuard >= 0 && clearanceFallback > canonicalGuard, "definition-backed immutable content must be handled before the legacy clearance fallback");
});
