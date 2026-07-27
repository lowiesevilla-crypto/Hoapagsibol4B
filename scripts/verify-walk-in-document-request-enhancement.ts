import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Check = [name: string, passed: boolean, detail: string];

const root = process.cwd();

function main() {
  const checks: Check[] = [];
  const page = read("app/admin/documents/new/page.tsx");
  const form = read("components/manual-document-form.tsx");
  const action = read("lib/actions/documents.ts");
  const workflow = read("lib/services/document-workflow.ts");
  const generation = read("lib/services/document-generation.ts");

  add(checks, "walk-in page does not preload all active homeowners", !page.includes("homeownerProfile.findMany"), "homeowner search moved to API");
  add(checks, "walk-in page passes normalized dynamic fields", page.includes("normalizeDocumentFields(definition.fields)"), "definition fields serialized");
  add(checks, "homeowner search API exists", exists("app/api/admin/document-walk-in/homeowners/route.ts"), "tenant-scoped route");
  add(checks, "household-member API exists", exists("app/api/admin/document-walk-in/homeowners/[id]/household-members/route.ts"), "tenant-scoped route");
  add(checks, "form fetches homeowner search from server", form.includes("/api/admin/document-walk-in/homeowners?q=") && form.includes("window.setTimeout"), "debounced fetch");
  add(checks, "form fetches validated household members from server", form.includes("/household-members") && form.includes("HOUSEHOLD_MEMBER"), "member selector");
  add(checks, "server action validates configured fields", action.includes("parseConfiguredFields(formData, definition.fields)") && action.includes("parsed.errors"), "shared parser");
  add(checks, "server action validates household eligibility", action.includes("householdMemberEligibility(member") && action.includes("subjectMemberId: member?.id"), "tenant/household eligible");
  add(checks, "server action snapshots selected subject", action.includes("buildSubjectSnapshot({ subjectType") && action.includes("subjectSnapshotJson(subjectSnapshot)"), "immutable snapshot");
  add(checks, "request-time account number is ensured", action.includes("ensureHomeownerAccountNumber(homeowner"), "reservation-backed assignment");
  add(checks, "subject snapshot carries account number", workflow.includes("accountNumber: homeownerAccountNumber(homeowner)"), "snapshot account field");
  add(checks, "generation exposes account number placeholder", generation.includes("accountNumber: text(subject.accountNumber)") && generation.includes("homeownerAccountNumber(request.homeowner)"), "property.accountNumber");
  add(checks, "docs/00-project-management untouched by verifier", !exists("docs/00-project-management/walk-in-request-and-account-number-uat.md"), "no task docs in docs/00");
  report(checks);
}

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath: string) {
  return existsSync(path.join(root, relativePath));
}

function add(checks: Check[], name: string, passed: boolean, detail: string) {
  checks.push([name, passed, detail]);
}

function report(checks: Check[]) {
  for (const [name, passed, detail] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name} :: ${detail}`);
  const failed = checks.filter(([, passed]) => !passed);
  if (failed.length) throw new Error(`${failed.length} walk-in enhancement check(s) failed.`);
}

main();
