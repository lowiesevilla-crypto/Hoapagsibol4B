import assert from "node:assert/strict";
import { test } from "node:test";
import { bondRefundUserMessage } from "@/lib/bond-refund-errors";

test("bond refund business failures are converted to actionable user messages", () => {
  assert.equal(
    bondRefundUserMessage(new Error("Refund cannot exceed the remaining bond balance.")),
    "Refund amount exceeds the remaining bond balance. Enter an amount up to the available balance shown for the bond.",
  );
  assert.equal(
    bondRefundUserMessage(new Error("This bond is already closed.")),
    "This bond is already closed and cannot be refunded again.",
  );
  assert.equal(
    bondRefundUserMessage(new Error("Refundable bond not found.")),
    "This bond is no longer available for refund. Reload the page and select an open bond.",
  );
});

test("unexpected refund failures are not exposed to the browser", () => {
  assert.equal(bondRefundUserMessage(new Error("database connection secret")), null);
  assert.equal(bondRefundUserMessage("database connection secret"), null);
});
