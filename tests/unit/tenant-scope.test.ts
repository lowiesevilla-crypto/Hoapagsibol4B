import assert from "node:assert/strict";
import test from "node:test";
import { tenantRecord, tenantWhere } from "../../lib/authorization/tenant-scope";
import { platformAdmin, tenantA, tenantB } from "../fixtures/tenants";

test("tenant users can access records from their own tenant", () => {
  const record = { id: "record-a", tenantId: tenantA.id, amount: 100 };

  assert.equal(tenantRecord(tenantA.admin, record), record);
  assert.equal(tenantRecord(tenantA.billingManager, record), record);
  assert.equal(tenantRecord(tenantA.homeowner, record), record);
});

test("tenant users cannot access another tenant's records", () => {
  const tenantBRecord = { id: "record-b", tenantId: tenantB.id, amount: 200 };

  assert.throws(
    () => tenantRecord(tenantA.admin, tenantBRecord),
    /Record not found or access denied/,
  );
  assert.throws(
    () => tenantRecord(tenantA.billingManager, tenantBRecord),
    /Record not found or access denied/,
  );
  assert.throws(
    () => tenantRecord(tenantA.homeowner, tenantBRecord),
    /Record not found or access denied/,
  );
});

test("platform administrators can inspect tenant records through the approved platform boundary", () => {
  const tenantBRecord = { id: "record-b", tenantId: tenantB.id };

  assert.equal(tenantRecord(platformAdmin, tenantBRecord), tenantBRecord);
});

test("missing records fail with the same safe denial error", () => {
  assert.throws(
    () => tenantRecord(tenantA.admin, null),
    /Record not found or access denied/,
  );
});

test("tenantWhere overrides an attacker-supplied tenant identifier", () => {
  const scoped = tenantWhere(tenantA.id, {
    tenantId: tenantB.id,
    homeownerId: "homeowner-b",
    active: true,
  });

  assert.deepEqual(scoped, {
    tenantId: tenantA.id,
    homeownerId: "homeowner-b",
    active: true,
  });
});
