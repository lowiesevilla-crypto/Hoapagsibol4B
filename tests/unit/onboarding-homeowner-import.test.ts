import assert from "node:assert/strict";
import test from "node:test";
import { onboardingHomeownerTemplateCsv, parseOnboardingHomeownerCsv } from "../../lib/services/onboarding-homeowner-import";

test("versioned template contains no password column and validates", () => {
  const csv = onboardingHomeownerTemplateCsv();
  assert.equal(csv.includes("password"), false);
  const preview = parseOnboardingHomeownerCsv(csv);
  assert.equal(preview.version, "1.0");
  assert.equal(preview.rows.length, 1);
  assert.deepEqual(preview.errors, []);
});

test("preview rejects duplicate identities, properties, and invalid money", () => {
  const header = "name,email,phone,address,block,lot,phase,propertyType,occupancyStatus,accountNumber,monthlyDuesAmount,openingBalance";
  const preview = parseOnboardingHomeownerCsv([
    header,
    "A,a@example.com,1,Addr,A,1,,,,123,500,-1",
    "B,a@example.com,2,Addr,A,1,,,,123,invalid,0",
  ].join("\n"));
  assert.ok(preview.errors.some((error) => error.field === "email" && error.message.includes("Duplicate")));
  assert.ok(preview.errors.some((error) => error.field === "lot" && error.message.includes("Duplicate")));
  assert.ok(preview.errors.some((error) => error.field === "accountNumber"));
  assert.ok(preview.errors.some((error) => error.field === "monthlyDuesAmount"));
  assert.ok(preview.errors.some((error) => error.field === "openingBalance"));
});

test("fingerprint is deterministic and changes with business data", () => {
  const first = parseOnboardingHomeownerCsv(onboardingHomeownerTemplateCsv());
  const second = parseOnboardingHomeownerCsv(onboardingHomeownerTemplateCsv());
  const changed = parseOnboardingHomeownerCsv(onboardingHomeownerTemplateCsv().replace(",500,0", ",600,0"));
  assert.equal(first.fingerprint, second.fingerprint);
  assert.notEqual(first.fingerprint, changed.fingerprint);
});
