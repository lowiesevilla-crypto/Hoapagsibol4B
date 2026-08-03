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

function changedFiles() {
  return execSync("git diff --name-only HEAD", { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll("\\", "/"));
}

const requestsPage = readProjectFile("app/portal/requests/page.tsx");
const documentsPage = readProjectFile("app/portal/documents/page.tsx");
const complaintsPage = readProjectFile("app/portal/complaints/page.tsx");
const complaintDetailPage = readProjectFile("app/portal/complaints/[id]/page.tsx");
const complaintNewPage = readProjectFile("app/portal/complaints/new/page.tsx");
const documentDetailPage = readProjectFile("app/documents/[id]/page.tsx");
const documentAccess = readProjectFile("lib/document-access.ts");
const complaintService = readProjectFile("lib/services/complaints.ts");
const requestCards = readProjectFile("components/homeowner/requests/request-cards.tsx");
const generatedViewer = readProjectFile("components/homeowner/requests/generated-document-viewer.tsx");
const serviceWorker = readProjectFile("public/sw.js");
const navigation = readProjectFile("lib/homeowner-navigation.ts");
const packageJson = readProjectFile("package.json");
const files = changedFiles();

for (const relativePath of [
  "app/portal/requests/page.tsx",
  "app/portal/documents/page.tsx",
  "app/portal/complaints/page.tsx",
  "app/portal/complaints/[id]/page.tsx",
  "app/portal/complaints/new/page.tsx",
  "app/documents/[id]/page.tsx",
  "components/homeowner/requests/request-cards.tsx",
  "components/homeowner/requests/generated-document-viewer.tsx",
]) {
  record(`${relativePath} exists`, existsSync(path.join(root, relativePath)));
}

record("request hub requires HOMEOWNER auth", requestsPage.includes("requireUser(Role.HOMEOWNER)"));
record("documents page requires HOMEOWNER auth", documentsPage.includes("requireUser(Role.HOMEOWNER)"));
record("complaints pages use homeowner complaint guard", [complaintsPage, complaintDetailPage, complaintNewPage].every((source) => source.includes("requireComplaintHomeowner")));
record("document request data is tenant-scoped", [requestsPage, documentsPage].every((source) => source.includes("tenantId: user.tenantId")));
record("document request data is homeowner-owned", [requestsPage, documentsPage].every((source) => source.includes("homeownerId")));
record("complaint detail service enforces tenant and homeowner ownership", hasAll(complaintService, ["getHomeownerComplaintDetail", "tenantId: user.tenantId", "submittedById: user.id", "homeownerId: user.homeownerProfile?.id", "confidentialIdentity"]));
record("generated document route uses existing access service", hasAll(documentDetailPage, ["getAccessibleGeneratedDocument", "downloadAllowed", "GeneratedDocumentViewer"]));
record("generated document access redirects unauthorized homeowners", hasAll(documentAccess, ["Role.HOMEOWNER", "request.homeownerId !== user.homeownerProfile?.id", "redirect(\"/portal/documents\")"]));
record("document request creation reuses existing form", hasAll(documentsPage, ["DocumentRequestForm", "getRequestableDocumentDefinitions", "saveHouseholdMemberAction", "resubmitCertificateAction"]));
record("Gate Pass and Move-In/Out reuse document request flow", hasAll(requestsPage + documentsPage, ["DocumentType.GATE_PASS", "DocumentType.MOVE_IN_OUT_PASS"]) && !existsSync(path.join(root, "app/portal/gate-pass")) && !existsSync(path.join(root, "app/portal/move-in-out")));
record("complaint intake reuses existing form and service", hasAll(complaintNewPage, ["ComplaintIntakeForm", "getComplaintCategories", "requireComplaintHomeowner"]));
record("request-area navigation is centralized", hasAll(requestCards, ["RequestAreaNavigation", "/portal/requests", "/portal/documents", "/portal/complaints", "/complaints/track"]) && navigation.includes("requests"));
record("mobile request cards replace wide complaint table on phones", hasAll(complaintsPage, ["ComplaintRequestCard", "md:hidden", "hidden rounded-3xl", "<table"]));
record("document history includes search filter and pagination", hasAll(documentsPage, ["name=\"q\"", "name=\"status\"", "name=\"type\"", "name=\"date\"", "skip:", "take: 10"]));
record("request hub uses limited result sets", hasAll(requestsPage, ["REQUEST_LIMIT", "take: REQUEST_LIMIT"]));
record("status tracking is visible", requestCards.includes("RequestProgressTracker") && documentsPage.includes("RequestProgressTracker") && complaintDetailPage.includes("RequestProgressTracker") && hasAll(requestsPage, ["DocumentRequestCard", "ComplaintRequestCard"]));
record("download print and preview actions remain permission-aware", hasAll(documentsPage + documentDetailPage, ["resolveDocumentDownloadAccess", "downloadAllowed", "Download locked"]));
record("generated document preview is mobile-responsive", hasAll(generatedViewer, ["zoom", "overflow-auto", "min-w-[320px]", "iframe", "navigator.share"]));
record("loading states exist for request area", ["requests", "documents", "complaints"].every((route) => existsSync(path.join(root, `app/portal/${route}/loading.tsx`))) && existsSync(path.join(root, "app/portal/complaints/[id]/loading.tsx")));
record("error states exist for request area", ["requests", "documents", "complaints"].every((route) => existsSync(path.join(root, `app/portal/${route}/error.tsx`))) && existsSync(path.join(root, "app/portal/complaints/[id]/error.tsx")));
record("empty states exist for request area", hasAll(requestCards, ["RequestEmptyState"]) && [requestsPage, documentsPage, complaintsPage].every((source) => source.includes("RequestEmptyState") || source.includes("No ")));
record("service worker keeps portal documents complaints uploads network-only", hasAll(serviceWorker, ["/portal", "/documents/", "/uploads/", "/complaints", "/api/", "hasSensitiveRequest"]));
record("no mutation queueing was introduced", !/syncManager|background sync|mutation queue|queueMutation/i.test(serviceWorker + requestCards + generatedViewer));
record("authenticated portal HTML remains uncached", serviceWorker.indexOf("hasSensitiveRequest(url.pathname)") < serviceWorker.indexOf('request.mode === "navigate"'));
record("no request document complaint services were rewritten", !files.some((file) => /^lib\/services\/(complaints|documents|document-workflow|document-definitions|document-generation|document-template-builder|document-placeholders)/.test(file)));
record("no Prisma schema or migration change", !files.some((file) => file === "prisma/schema.prisma" || file.startsWith("prisma/migrations/")));
record("no admin employee payroll platform pages changed", !files.some((file) => /^(app\/admin|app\/employee|app\/payroll|app\/platform)/.test(file)));
record("Phase 5 verifier is registered", packageJson.includes("\"verify:homeowner-mobile-requests\""));

const failed = checks.filter((check) => !check.passed);
for (const check of checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"} ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
}

if (failed.length > 0) {
  console.error(`\nHomeowner mobile requests verification failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log(`\nHomeowner mobile requests verification passed: ${checks.length} checks.`);
