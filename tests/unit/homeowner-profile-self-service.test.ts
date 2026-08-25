import assert from "node:assert/strict";
import test from "node:test";
import { householdMemberEligibility } from "../../lib/services/household-member-eligibility";
import {
  parseHomeownerSelfProfileInput,
  parseHouseholdMemberSelfServiceInput,
} from "../../lib/services/homeowner-profile-self-service";

const validProfile = {
  name: "Juan Dela Cruz",
  email: "juan@example.com",
  phone: "09171234567",
  birthDate: "1990-01-01",
  civilStatus: "Married",
  citizenship: "Filipino",
  occupation: "Engineer",
  residencyDate: "2020-01-01",
  phase: "1",
  propertyType: "House and Lot",
  occupancyStatus: "Owner occupied",
  address: "Block 1 Lot 2, Pagsibol Village",
  block: "1",
  lot: "2",
  messengerId: "",
};

test("homeowner self-service accepts editable profile fields", () => {
  const parsed = parseHomeownerSelfProfileInput(validProfile);
  assert.equal(parsed.name, "Juan Dela Cruz");
  assert.equal(parsed.email, "juan@example.com");
  assert.equal(parsed.block, "1");
  assert.equal(parsed.lot, "2");
});

test("homeowner self-service rejects account number and monthly dues changes", () => {
  assert.throws(
    () => parseHomeownerSelfProfileInput({ ...validProfile, accountNumber: "12345678901" }),
    /cannot be changed from the homeowner portal/i,
  );
  assert.throws(
    () => parseHomeownerSelfProfileInput({ ...validProfile, monthlyDuesAmount: "2500" }),
    /cannot be changed from the homeowner portal/i,
  );
});

test("household member self-service validates required member details", () => {
  const parsed = parseHouseholdMemberSelfServiceInput({
    fullName: "Maria Dela Cruz",
    relationship: "Spouse",
    birthDate: "1992-03-04",
    civilStatus: "Married",
    nationality: "Filipino",
    address: "",
  });
  assert.equal(parsed.fullName, "Maria Dela Cruz");
  assert.equal(parsed.relationship, "Spouse");
});

test("active household member is eligible without HOA approval", () => {
  const eligibility = householdMemberEligibility(
    {
      tenantId: "tenant-a",
      homeownerId: "homeowner-a",
      active: true,
      validatedAt: null,
      revokedAt: null,
    },
    { tenantId: "tenant-a", homeownerId: "homeowner-a" },
  );
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.label, "Active");
});

test("household member ownership and tenant isolation remain enforced", () => {
  const member = {
    tenantId: "tenant-a",
    homeownerId: "homeowner-a",
    active: true,
    validatedAt: null,
    revokedAt: null,
  };
  assert.equal(householdMemberEligibility(member, { tenantId: "tenant-b", homeownerId: "homeowner-a" }).eligible, false);
  assert.equal(householdMemberEligibility(member, { tenantId: "tenant-a", homeownerId: "homeowner-b" }).eligible, false);
  assert.equal(householdMemberEligibility({ ...member, revokedAt: new Date() }, { tenantId: "tenant-a", homeownerId: "homeowner-a" }).eligible, false);
});
