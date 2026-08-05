import assert from "node:assert/strict";
import { test } from "node:test";
import {
  highRiskPermissionSelection,
  isHighRiskPermission,
  requireAuthorizationChangeReason,
  requireAuthorizationConfirmation,
} from "@/lib/authorization/permission-risk";
import { Permission } from "@/lib/authorization/permissions";

test("financial reversals and authorization administration are high risk", () => {
  assert.equal(isHighRiskPermission(Permission.PAYMENTS_VOID), true);
  assert.equal(isHighRiskPermission(Permission.PAYMENTS_REFUND), true);
  assert.equal(isHighRiskPermission(Permission.ROLES_MANAGE), true);
  assert.equal(isHighRiskPermission(Permission.BILLING_READ), false);
});

test("high-risk selection is deterministic", () => {
  assert.deepEqual(
    highRiskPermissionSelection([
      Permission.BILLING_READ,
      Permission.PAYMENTS_REFUND,
      Permission.ROLES_MANAGE,
    ]),
    [Permission.PAYMENTS_REFUND, Permission.ROLES_MANAGE],
  );
});

test("authorization changes require an explicit reason and confirmation", () => {
  assert.throws(() => requireAuthorizationChangeReason("too short"));
  assert.equal(
    requireAuthorizationChangeReason("Required for approved finance duties."),
    "Required for approved finance duties.",
  );
  assert.throws(() => requireAuthorizationConfirmation(null));
  assert.doesNotThrow(() => requireAuthorizationConfirmation("yes"));
});
