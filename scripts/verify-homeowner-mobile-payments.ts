import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Check = { label: string; passed: boolean; detail?: string };

const root = process.cwd();
const checks: Check[] = [];

function record(label: string, passed: boolean, detail?: string) {
  checks.push({ label, passed, detail });
}

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function hasAll(source: string, values: string[]) {
  return values.every((value) => source.includes(value));
}

function hasResponsiveMobileCardsAndDesktopTable(source: string) {
  return source.includes("md:hidden") && source.includes("<table") && /className="[^"]*\bhidden\b[^"]*\bmd:block\b[^"]*"/.test(source);
}

function changedFiles() {
  return execSync("git diff --name-only HEAD", { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll("\\", "/"));
}

const payPage = readProjectFile("app/portal/pay/page.tsx");
const billingPage = readProjectFile("app/portal/billing/page.tsx");
const paymentsPage = readProjectFile("app/portal/payments/page.tsx");
const collectionsPage = readProjectFile("app/portal/collections/page.tsx");
const soaPage = readProjectFile("app/portal/soa/page.tsx");
const receiptPage = readProjectFile("app/receipts/[kind]/[id]/page.tsx");
const payForm = readProjectFile("components/pay-by-qr-form.tsx");
const proofUpload = readProjectFile("components/payment-proof-upload.tsx");
const paymentCards = readProjectFile("components/homeowner/payments/payment-cards.tsx");
const paymentActions = readProjectFile("lib/actions/payment-requests.ts");
const paymentMethods = readProjectFile("lib/payment-methods.ts");
const paymentProofs = readProjectFile("lib/payment-proofs.ts");
const navigation = readProjectFile("lib/homeowner-navigation.ts");
const serviceWorker = readProjectFile("public/sw.js");
const files = changedFiles();

for (const relativePath of [
  "app/portal/pay/page.tsx",
  "app/portal/billing/page.tsx",
  "app/portal/soa/page.tsx",
  "app/portal/payments/page.tsx",
  "app/portal/collections/page.tsx",
  "components/homeowner/payments/payment-cards.tsx",
  "components/payment-proof-upload.tsx",
]) {
  record(`${relativePath} exists`, existsSync(path.join(root, relativePath)));
}

record("payment pages require homeowner authentication", [payPage, billingPage, paymentsPage, collectionsPage, soaPage].every((source) => source.includes("requireHomeownerProfile")));
record("payment data is tenant-scoped", [payPage, billingPage, paymentsPage, collectionsPage].every((source) => source.includes("tenantId: profile.tenantId")));
record("payment data is homeowner-owned", [payPage, billingPage, paymentsPage, collectionsPage].every((source) => source.includes("homeownerId: profile.id")));
record("current balance uses existing SOA source", hasAll(payPage, ["getStatementOfAccount", "soa.summary.currentOutstandingBalance"]) && hasAll(soaPage, ["getStatementOfAccount", "soa.summary.currentOutstandingBalance"]));
record("no browser balance API or client authority introduced", !existsSync(path.join(root, "app/api/portal/balance/route.ts")) && hasAll(paymentActions, ["requireUser(Role.HOMEOWNER)", "tenantId: user.tenantId", "homeownerId: user.homeownerProfile.id", "bill.balance"]));
record("Pay Now reuses existing payment action", hasAll(payForm, ["submitPaymentRequestAction", 'action={submitPaymentRequestAction}']) && hasAll(paymentActions, ["export async function submitPaymentRequestAction"]));
record("Cash does not require a reference number in existing method rules", hasAll(paymentMethods, ["paymentMethodRequiresReference", 'method !== "CASH"']));
record("GCash and transfer reference rules are preserved", hasAll(paymentMethods, ["paymentMethodRequiresReference", 'method !== "CASH"']) && hasAll(paymentActions, ["referenceNumber", "This payment reference number has already"]));
record("proof upload validates type and size on client and server", hasAll(proofUpload, ["allowedTypes", "maxBytes", "image/jpeg", "application/pdf"]) && hasAll(paymentProofs, ["allowedTypes", "maxPaymentProofBytes"]));
record("proof upload does not expose storage paths", !proofUpload.includes("storageKey") && !proofUpload.includes("filePath") && !proofUpload.includes("public/"));
record("proof access remains tied to existing authorized receipt/payment routes", hasAll(receiptPage, ["getPaymentReceiptData", "user.homeownerProfile?.id !== receipt.homeownerId", "redirect(\"/portal/dashboard\")"]));
record("duplicate submission is disabled", hasAll(payForm, ["pending", "disabled", "Duplicate"]));
record("offline submission is blocked", hasAll(payForm, ["navigator.onLine", "online", "offline", "disabled while offline", "online && hasAmount"]));
record("payment mutations are not queued", !/queue|background sync|syncManager|mutation cache/i.test(payForm + serviceWorker));
record("payment responses are network-only in service worker", hasAll(serviceWorker, ["/portal", "/api/", 'request.method !== "GET"', "hasSensitiveRequest"]));
record("authenticated portal HTML is not cached", serviceWorker.indexOf("hasSensitiveRequest(url.pathname)") < serviceWorker.indexOf('request.mode === "navigate"'));
record("receipts uploads and documents are not cached by service worker", hasAll(serviceWorker, ["/receipts/", "/uploads/", "/documents/"]));
record("receipt numbering service is unchanged", !files.some((file) => /receipt|number/i.test(file) && file.startsWith("lib/")));
record("billing coverage is displayed", hasAll(payPage, ["monthLabel", "oldestCoverage"]) && hasAll(paymentsPage, ["paymentAllocationCoverageLabel"]));
record("payment history is paginated or limited", hasAll(paymentsPage, ["PAGE_SIZE", "skip:", "take: PAGE_SIZE"]));
record("mobile cards replace wide tables below mobile breakpoint", [billingPage, paymentsPage, collectionsPage, soaPage].every(hasResponsiveMobileCardsAndDesktopTable));
record("desktop tables remain available", [billingPage, paymentsPage, collectionsPage, soaPage].every((source) => source.includes("<table")));
record("mobile action remains above bottom navigation", hasAll(payForm, ["sticky", "bottom-[calc", "env(safe-area-inset-bottom)"]));
record("minimum 48px touch targets exist", hasAll(payForm + paymentCards + paymentsPage, ["min-h-12", "focus-visible:outline"]));
record("empty states exist", hasAll(paymentCards, ["PaymentEmptyState"]) && [payPage, billingPage, paymentsPage, collectionsPage].every((source) => source.includes("PaymentEmptyState")));
record("loading states exist for payment area", ["pay", "billing", "payments", "collections", "soa"].every((route) => existsSync(path.join(root, `app/portal/${route}/loading.tsx`))));
record("error states exist for payment area", ["pay", "billing", "payments", "collections", "soa"].every((route) => existsSync(path.join(root, `app/portal/${route}/error.tsx`))));
record("payment bottom navigation activates all payment routes", hasAll(navigation, ["/portal/pay", "/portal/billing", "/portal/soa", "/portal/payments", "/portal/collections"]));
record("SOA print uses dedicated client print button", hasAll(soaPage, ["SoaPrintButton"]) && existsSync(path.join(root, "components/soa-print-button.tsx")));
record("no Prisma schema or migration change", !files.some((file) => file === "prisma/schema.prisma" || file.startsWith("prisma/migrations/")));
record("no admin employee payroll platform payment interface changes", !files.some((file) => /^(app\/admin|app\/employee|app\/payroll|app\/platform)/.test(file)));
record("no auth tenant isolation or payment calculation service changes", !files.some((file) => /^(lib\/auth|lib\/tenant-context|lib\/services\/statement-of-account|lib\/payment-credit|lib\/payment-coverage|lib\/actions\/payment-requests)/.test(file)));

const failed = checks.filter((check) => !check.passed);
for (const check of checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"} ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
}

if (failed.length > 0) {
  console.error(`\nHomeowner mobile payments verification failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log(`\nHomeowner mobile payments verification passed: ${checks.length} checks.`);
