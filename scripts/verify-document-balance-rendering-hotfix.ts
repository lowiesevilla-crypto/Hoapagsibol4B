import { readFileSync } from "node:fs";
import { DocumentOutstandingBalancePolicy, DocumentRequestStatus, PaymentRequestStatus } from "@prisma/client";
import { documentOutstandingBalancePolicyOptions, resolveDocumentDownloadAccess } from "../lib/services/document-balance-policy";

let failures = 0;

function assert(condition: unknown, label: string, detail = "") {
  if (!condition) {
    failures += 1;
    console.error(`FAIL ${label}${detail ? `: ${detail}` : ""}`);
    return;
  }
  console.log(`PASS ${label}${detail ? `: ${detail}` : ""}`);
}

function source(path: string) {
  return readFileSync(path, "utf8");
}

function request(policy: DocumentOutstandingBalancePolicy, overrides: Partial<Parameters<typeof resolveDocumentDownloadAccess>[0]["request"]> = {}) {
  return {
    status: DocumentRequestStatus.ISSUED,
    paymentRequiredSnapshot: false,
    allowDownloadDespiteBalance: false,
    definition: { outstandingBalancePolicy: policy },
    definitionSnapshot: null,
    paymentRequest: null,
    ...overrides,
  };
}

async function main() {
  const optionLabels = documentOutstandingBalancePolicyOptions.map((option) => option.label);
  assert(optionLabels.length === 3, "definition setup exposes exactly three business balance policies", optionLabels.join(", "));
  assert(optionLabels.includes("Block When Balance Exists"), "BLOCK_WITH_BALANCE business label is present");
  assert(optionLabels.includes("Allow Admin Override"), "ALLOW_ADMIN_OVERRIDE business label is present");
  assert(optionLabels.includes("Allow Download With Balance"), "ALLOW_WITH_BALANCE business label is present");
  assert(!optionLabels.some((label) => label.includes("Block Request")), "legacy BLOCK_REQUEST is not offered for setup");

  const block = resolveDocumentDownloadAccess({ request: request(DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD), currentOutstandingBalance: 1250 });
  assert(block.balanceLocked && !block.downloadAllowed, "BLOCK_WITH_BALANCE blocks download with qualifying balance");

  const allow = resolveDocumentDownloadAccess({ request: request(DocumentOutstandingBalancePolicy.IGNORE_BALANCE), currentOutstandingBalance: 1250 });
  assert(!allow.balanceLocked && allow.downloadAllowed, "ALLOW_WITH_BALANCE allows download with unrelated balance");

  const overrideBefore = resolveDocumentDownloadAccess({ request: request(DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE), currentOutstandingBalance: 1250 });
  assert(overrideBefore.balanceLocked && !overrideBefore.downloadAllowed, "ALLOW_ADMIN_OVERRIDE blocks before request override");

  const overrideAfter = resolveDocumentDownloadAccess({ request: request(DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE, { allowDownloadDespiteBalance: true }), currentOutstandingBalance: 1250 });
  assert(!overrideAfter.balanceLocked && overrideAfter.downloadAllowed, "ALLOW_ADMIN_OVERRIDE allows download after request override");

  const unpaidFee = resolveDocumentDownloadAccess({ request: request(DocumentOutstandingBalancePolicy.IGNORE_BALANCE, { paymentRequiredSnapshot: true, paymentRequest: { status: PaymentRequestStatus.PENDING_REVIEW } }), currentOutstandingBalance: 0 });
  assert(unpaidFee.paymentLocked && !unpaidFee.downloadAllowed, "document-specific unpaid fee still blocks issuance/download access");

  const adminPage = source("app/admin/documents/[id]/page.tsx");
  assert(adminPage.includes("Effective document rules"), "admin request page shows effective rules");
  assert(adminPage.includes("No separate policy assignment is configured. This request uses the rules stored directly in the Document Definition."), "misleading no-policy message is corrected");
  assert(adminPage.includes('request.status === "ISSUED"'), "balance override action is gated to issued requests");
  assert(adminPage.includes("canOverrideDocumentBalancePolicy(user.role)"), "balance override action checks authorized admin role");

  const definitionPage = source("app/admin/settings/document-definitions/page.tsx");
  assert(definitionPage.includes("Persisted effective configuration"), "definition page shows saved effective configuration");
  assert(definitionPage.includes("Requires payment"), "definition page shows effective payment rule");
  assert(definitionPage.includes("DocumentBalancePolicyControls") && source("components/document-balance-policy-controls.tsx").includes("Outstanding Balance Policy"), "definition page exposes balance policy control");

  const workflowControls = source("components/document-definition-workflow-controls.tsx");
  assert(workflowControls.includes("Resolved effective rules"), "workflow preset control shows resolved effective rules");

  const documentPage = source("app/documents/[id]/page.tsx");
  assert(documentPage.includes("srcDoc={request.generatedContent"), "official document page renders generated HTML in a viewer");
  assert(!documentPage.includes("whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-5 leading-8"), "official document page no longer displays raw HTML source block");

  const renderer = source("lib/services/document-renderers.ts");
  assert(renderer.includes("PREVIEW ONLY - NOT AN OFFICIAL DOCUMENT"), "admin preview includes non-official banner");
  assert(renderer.includes("PREVIEW - NOT VALID FOR ISSUANCE") || source("lib/services/document-render-model.ts").includes("PREVIEW - NOT VALID FOR ISSUANCE"), "admin preview includes non-valid watermark");
  assert(renderer.includes("Preview document number:"), "preview wording avoids official document number label");
  assert(renderer.includes("max-height:calc(100% - 30px)"), "preview QR image leaves room for label");
  assert(renderer.includes("preview://hoahub/document-verification"), "preview QR remains non-verifiable");

  const pdfRoute = source("app/documents/[id]/pdf/route.ts");
  const printRoute = source("app/documents/[id]/print/page.tsx");
  assert(pdfRoute.includes("generatedPlainText(request.generatedContent!)"), "PDF fallback avoids raw HTML source");
  assert(printRoute.includes("generatedPlainText(request.generatedContent || \"\")"), "print fallback avoids raw HTML source");

  if (failures > 0) throw new Error(`${failures} document balance/rendering hotfix checks failed.`);
  console.log("Document balance and rendering hotfix verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
