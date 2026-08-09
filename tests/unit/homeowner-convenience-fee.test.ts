import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlatformFeeSplitPayment,
  checkoutAmounts,
  normalizePlatformFeeCentavos,
  parsePlatformFeePesos,
  settingEnabled,
  validatePaidCheckoutAmounts,
} from "../../lib/homeowner-convenience-fee";

test("platform fee is disabled unless explicitly enabled with a positive amount", () => {
  assert.equal(settingEnabled(undefined), false);
  assert.equal(settingEnabled("false"), false);
  assert.equal(settingEnabled("true"), true);
  assert.equal(settingEnabled("ON"), true);
  assert.equal(normalizePlatformFeeCentavos(undefined), 0);
  assert.equal(normalizePlatformFeeCentavos("0"), 0);
  assert.equal(normalizePlatformFeeCentavos("2000"), 2000);
});

test("platform fee parses exact peso values into centavos", () => {
  assert.equal(parsePlatformFeePesos("20"), 2000);
  assert.equal(parsePlatformFeePesos("20.50"), 2050);
  assert.equal(parsePlatformFeePesos("0.01"), 1);
  assert.throws(() => parsePlatformFeePesos("0"), /greater than PHP 0.00/);
  assert.throws(() => parsePlatformFeePesos("20.555"), /valid peso amount/);
  assert.throws(() => parsePlatformFeePesos("10000.01"), /no more than PHP 10,000.00/);
});

test("checkout amounts keep HOA principal separate from platform fee", () => {
  assert.deepEqual(checkoutAmounts(1000, 2000), {
    principalCentavos: 100000,
    platformFeeCentavos: 2000,
    baseChargeCentavos: 102000,
  });
  assert.deepEqual(checkoutAmounts(1000, 0), {
    principalCentavos: 100000,
    platformFeeCentavos: 0,
    baseChargeCentavos: 100000,
  });
});

test("split payment sends fixed HOAHub fee to parent and remaining net to tenant child", () => {
  assert.deepEqual(buildPlatformFeeSplitPayment({
    childAccountId: "org_TENANT_A",
    parentAccountId: "org_HOAHUB_PARENT",
    platformFeeCentavos: 2000,
  }), {
    transfer_to: "org_TENANT_A",
    recipients: [{
      merchant_id: "org_HOAHUB_PARENT",
      split_type: "fixed",
      value: 2000,
    }],
  });
  assert.equal(buildPlatformFeeSplitPayment({
    childAccountId: "org_TENANT_A",
    parentAccountId: "",
    platformFeeCentavos: 0,
  }), undefined);
  assert.throws(() => buildPlatformFeeSplitPayment({
    childAccountId: "org_TENANT_A",
    parentAccountId: "",
    platformFeeCentavos: 2000,
  }), /platform PayMongo account ID is not configured/);
  assert.throws(() => buildPlatformFeeSplitPayment({
    childAccountId: "org_SAME",
    parentAccountId: "org_SAME",
    platformFeeCentavos: 2000,
  }), /cannot be the tenant child account/);
});

test("webhook amount validation preserves HOA principal and isolates added fees", () => {
  assert.deepEqual(validatePaidCheckoutAmounts({
    requestPrincipalCentavos: 100000,
    paidCentavos: 103550,
    metadata: {
      principalAmountCentavos: "100000",
      platformFeeCentavos: "2000",
      baseChargeCentavos: "102000",
      passOnProcessingFees: "true",
    },
  }), {
    principalCentavos: 100000,
    platformFeeCentavos: 2000,
    providerFeeCentavos: 1550,
    baseChargeCentavos: 102000,
    totalPaidCentavos: 103550,
    passOnFees: true,
    legacyCheckout: false,
  });
});

test("webhook amount validation remains backward compatible with pre-fee checkouts", () => {
  assert.deepEqual(validatePaidCheckoutAmounts({
    requestPrincipalCentavos: 100000,
    paidCentavos: 100000,
    metadata: {},
  }), {
    principalCentavos: 100000,
    platformFeeCentavos: 0,
    providerFeeCentavos: 0,
    baseChargeCentavos: 100000,
    totalPaidCentavos: 100000,
    passOnFees: false,
    legacyCheckout: true,
  });
  assert.throws(() => validatePaidCheckoutAmounts({
    requestPrincipalCentavos: 100000,
    paidCentavos: 99000,
    metadata: {},
  }), /does not match/);
});

test("webhook rejects tampered fee snapshots and underpaid fee-bearing checkouts", () => {
  assert.throws(() => validatePaidCheckoutAmounts({
    requestPrincipalCentavos: 100000,
    paidCentavos: 102000,
    metadata: {
      principalAmountCentavos: "99900",
      platformFeeCentavos: "2000",
      baseChargeCentavos: "101900",
      passOnProcessingFees: "true",
    },
  }), /principal does not match/);
  assert.throws(() => validatePaidCheckoutAmounts({
    requestPrincipalCentavos: 100000,
    paidCentavos: 101000,
    metadata: {
      principalAmountCentavos: "100000",
      platformFeeCentavos: "2000",
      baseChargeCentavos: "102000",
      passOnProcessingFees: "true",
    },
  }), /below the homeowner checkout total/);
});
