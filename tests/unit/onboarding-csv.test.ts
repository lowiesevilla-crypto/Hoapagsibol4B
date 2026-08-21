import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ONBOARDING_HOMEOWNER_BATCH_SIZE,
  ONBOARDING_HOMEOWNER_COLUMNS,
  onboardingErrorCsv,
  onboardingHomeownerTemplateCsv,
  parseOnboardingHomeownerCsv,
} from "../../lib/onboarding/csv";
import { onboardingPrerequisites, type TenantOnboardingState } from "../../lib/onboarding/policy";
import {
  hasHomeownerContactEmail,
  homeownerContactEmail,
  homeownerNoEmailAddress,
  isHomeownerNoEmailAddress,
  maskEmail,
} from "../../lib/services/homeowner-digital-activation";

test("onboarding template is versioned and never contains a password column", () => {
  const template = onboardingHomeownerTemplateCsv();
  assert.equal(ONBOARDING_HOMEOWNER_COLUMNS.includes("accountNumber"), true);
  assert.equal(ONBOARDING_HOMEOWNER_COLUMNS.includes("openingBalance"), true);
  assert.equal(template.split("\n")[0].includes("password"), false);
});

test("valid homeowner CSV parses quoted fields, cents, and optional opening balance", () => {
  const csv = [
    ONBOARDING_HOMEOWNER_COLUMNS.join(","),
    '"Juan, Jr.",juan@example.com,09171234567,"123 Main Street",4,12,Phase 1,HOUSE_AND_LOT,OWNER_OCCUPIED,ACTIVE,500.25,12345678901,1250.50,2026-07-31',
  ].join("\n");
  const parsed = parseOnboardingHomeownerCsv(csv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].name, "Juan, Jr.");
  assert.equal(parsed.rows[0].monthlyDuesAmount, 500.25);
  assert.equal(parsed.rows[0].openingBalance, 1250.5);
  assert.equal(parsed.rows[0].openingBalanceAsOf?.toISOString().slice(0, 10), "2026-07-31");
  assert.match(parsed.fileHash, /^[a-f0-9]{64}$/);
});

test("blank homeowner email is accepted for later tenant-admin registration", () => {
  const csv = [
    ONBOARDING_HOMEOWNER_COLUMNS.join(","),
    "No Email Homeowner,,09171234567,123 Main Street,4,13,Phase 1,HOUSE_AND_LOT,OWNER_OCCUPIED,ACTIVE,500.00,,0.00,",
  ].join("\n");
  const parsed = parseOnboardingHomeownerCsv(csv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].email, "");
  assert.equal(parsed.rows[0].accountNumber, null);
});

test("internal no-email addresses are never treated or displayed as contact emails", () => {
  const placeholder = homeownerNoEmailAddress("12345678901");
  assert.equal(isHomeownerNoEmailAddress(placeholder), true);
  assert.equal(hasHomeownerContactEmail(placeholder), false);
  assert.equal(homeownerContactEmail(placeholder), "");
  assert.equal(maskEmail(placeholder), "Not registered");
});

test("CSV dry run rejects missing fields, duplicate identities, invalid money, and insecure account numbers", () => {
  const csv = [
    ONBOARDING_HOMEOWNER_COLUMNS.join(","),
    "Juan,juan@example.com,0917,Address,1,1,,,,ACTIVE,500,01234567890,100,",
    "Juan Two,juan@example.com,0918,Address Two,1,1,,,,ACTIVE,500.999,01234567890,0,",
  ].join("\n");
  const parsed = parseOnboardingHomeownerCsv(csv);
  assert.equal(parsed.rows.length, 0);
  assert.ok(parsed.errors.some((error) => error.field === "email" && /Duplicate/.test(error.message)));
  assert.ok(parsed.errors.some((error) => error.field === "block/lot" && /Duplicate/.test(error.message)));
  assert.ok(parsed.errors.some((error) => error.field === "monthlyDuesAmount"));
  assert.ok(parsed.errors.some((error) => error.field === "accountNumber"));
  assert.ok(parsed.errors.some((error) => error.field === "openingBalanceAsOf"));
});

test("large onboarding files are directed to consecutive safe batches", () => {
  assert.equal(ONBOARDING_HOMEOWNER_BATCH_SIZE, 500);
  const rows = Array.from({ length: ONBOARDING_HOMEOWNER_BATCH_SIZE + 1 }, (_, index) =>
    `Homeowner ${index + 1},,09${String(index).padStart(9, "0")},Address ${index + 1},B${index + 1},L${index + 1},,,,ACTIVE,500,,0,`,
  );
  const parsed = parseOnboardingHomeownerCsv([ONBOARDING_HOMEOWNER_COLUMNS.join(","), ...rows].join("\n"));
  assert.equal(parsed.rows.length, 0);
  assert.ok(parsed.errors.some((error) => error.rowNumber === null && /500 homeowner rows/.test(error.message) && /multiple batches/.test(error.message)));
});

test("onboarding UI explains how to continue after an applied batch", () => {
  const page = readFileSync("app/admin/onboarding/page.tsx", "utf8");
  assert.match(page, /Large community import: use consecutive safe batches/);
  assert.match(page, /500 \+ 500 \+ 500 \+ 500 \+ 50/);
  assert.match(page, /successful prior batches stay saved/);
  assert.match(page, /homeownerProfile\.count/);
});

test("error export escapes spreadsheet-sensitive CSV content safely", () => {
  const csv = onboardingErrorCsv([{ rowNumber: 2, field: "email", message: 'Invalid, value "quoted"' }]);
  assert.match(csv, /"Invalid, value ""quoted"""/);
});

test("onboarding completion requires profile, privacy, applied import, billing, and preview", () => {
  const base: TenantOnboardingState = { version: 1, updatedAt: new Date().toISOString() };
  assert.deepEqual(onboardingPrerequisites(base), { profile: false, privacy: false, import: false, billing: false, preview: false });
  const complete: TenantOnboardingState = {
    ...base,
    profile: { completedAt: "2026-08-05T00:00:00.000Z", timezone: "Asia/Manila", currency: "PHP", supportEmail: null, supportPhone: null, receiptPrefix: "OR", documentPrefix: "DOC" },
    privacy: { acknowledgedAt: "2026-08-05T00:00:00.000Z", acknowledgedById: "actor", dataControllerAccepted: true, secureHandlingAccepted: true, importAuthorizationAccepted: true },
    import: { templateVersion: "2.0", fileHash: "a".repeat(64), fileName: "homeowners.csv", validatedAt: "2026-08-05T00:00:00.000Z", validRows: 1, errors: [], appliedAt: "2026-08-05T00:00:00.000Z", importedRows: 1, openingBalancesPosted: 0 },
    billing: { completedAt: "2026-08-05T00:00:00.000Z", ruleId: "rule", monthlyAmount: 500, effectiveFrom: "2026-08", dueDay: 15, description: "Initial rule" },
    preview: { completedAt: "2026-08-05T00:00:00.000Z", year: 2026, month: 8, eligible: 1, skipped: 0, errors: 0, totalAmount: 500, confirmationRequired: true },
  };
  assert.deepEqual(onboardingPrerequisites(complete), { profile: true, privacy: true, import: true, billing: true, preview: true });
});
