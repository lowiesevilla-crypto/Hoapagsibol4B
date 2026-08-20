import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionSource = await readFile("lib/actions/document-request-submission.ts", "utf8");
const formSource = await readFile("components/document-request-form.tsx", "utf8");

test("document request success uses a redirect handoff after the authoritative server action", () => {
  assert.match(actionSource, /await submitDocumentRequestAction\(previousState, formData\)/);
  assert.match(actionSource, /if \(result\.status === "success"\)/);
  assert.match(actionSource, /redirect\(`\/portal\/documents\?\$\{query\.toString\(\)\}`\)/);
  assert.match(actionSource, /success: "request"/);
  assert.match(actionSource, /message: result\.message/);
});

test("document request form renders redirected confirmation as an accessible live status", () => {
  assert.match(formSource, /useActionState\(submitDocumentRequestWithRedirectAction, initialSubmissionState\)/);
  assert.match(formSource, /searchParams\.get\("success"\) === "request"/);
  assert.match(formSource, /role="status" aria-live="polite"/);
  assert.doesNotMatch(formSource, /router\.refresh\(\)/);
  assert.doesNotMatch(formSource, /SUCCESS_REFRESH_DELAY_MS/);
});
