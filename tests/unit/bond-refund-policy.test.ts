import assert from "node:assert/strict";
import test from "node:test";
import { bondRefundReference } from "../../lib/bond-refund-reference";

test("bond refund references are stable and include the refund year", () => {
  const refundId = "cm1234567890abcdefghijk";
  const refundDate = new Date("2026-08-05T00:00:00.000Z");

  assert.equal(
    bondRefundReference(refundId, refundDate),
    "RF-BR-2026-DEFGHIJK",
  );
  assert.equal(
    bondRefundReference(refundId, refundDate),
    bondRefundReference(refundId, refundDate),
  );
});
