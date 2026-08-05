import assert from "node:assert/strict";
import test from "node:test";
import {
  paymentAppliedAmount,
  paymentUnappliedCredit,
  totalUnappliedCredit,
} from "../../lib/payment-credit";
import {
  buildPaymentCoverage,
  buildPaymentCoveragePeriod,
  validatePaymentCoveragePeriod,
} from "../../lib/payment-coverage";

test("payment credit calculations use allocations and preserve centavo rounding", () => {
  assert.equal(paymentAppliedAmount({ amount: 10.005 }), 10.01);
  assert.equal(
    paymentAppliedAmount({ amount: 100, allocations: [{ amount: 40 }, { amount: 35 }] }),
    75,
  );
  assert.equal(
    paymentUnappliedCredit({ amount: 100, allocations: [{ amount: 40 }, { amount: 35 }] }),
    25,
  );
});

test("payment credit never becomes negative when allocations exceed the payment", () => {
  assert.equal(
    paymentUnappliedCredit({ amount: 100, allocations: [{ amount: 80 }, { amount: 30 }] }),
    0,
  );
});

test("total unapplied credit aggregates independent payments", () => {
  assert.equal(
    totalUnappliedCredit([
      { amount: 100, allocations: [{ amount: 75 }] },
      { amount: 50.5, allocations: [{ amount: 35 }] },
    ]),
    40.5,
  );
});

test("payment coverage normalizes duplicate and unordered billing months", () => {
  const coverage = buildPaymentCoverage([
    "2026-03-15",
    "2026-01-01",
    "2026-02-20",
    "2026-03-01",
  ]);

  assert.deepEqual(coverage.coverageMonths, ["2026-01-01", "2026-02-01", "2026-03-01"]);
  assert.equal(coverage.paymentCoverageDisplay, "Monthly Dues - January 2026 to March 2026");
});

test("payment coverage supports periods that cross a calendar year", () => {
  const coverage = buildPaymentCoveragePeriod({
    coverageFromMonth: 11,
    coverageFromYear: 2026,
    coverageToMonth: 2,
    coverageToYear: 2027,
  });

  assert.deepEqual(coverage.coverageMonths, [
    "2026-11-01",
    "2026-12-01",
    "2027-01-01",
    "2027-02-01",
  ]);
});

test("invalid or reversed payment coverage periods are rejected", () => {
  assert.throws(
    () => validatePaymentCoveragePeriod({
      coverageFromMonth: 0,
      coverageFromYear: 2026,
      coverageToMonth: 1,
      coverageToYear: 2026,
    }),
    /Coverage month must be between January and December/,
  );

  assert.throws(
    () => validatePaymentCoveragePeriod({
      coverageFromMonth: 5,
      coverageFromYear: 2027,
      coverageToMonth: 4,
      coverageToYear: 2027,
    }),
    /Coverage To must not be earlier than Coverage From/,
  );
});
