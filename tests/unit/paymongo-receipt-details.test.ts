import assert from "node:assert/strict";
import test from "node:test";
import { extractPayMongoReceiptDetails, payMongoChannelLabel } from "../../lib/paymongo-receipt-details";

test("PayMongo AR channel labels use homeowner-facing names", () => {
  assert.equal(payMongoChannelLabel("gcash"), "GCash");
  assert.equal(payMongoChannelLabel("qrph"), "QR PH");
  assert.equal(payMongoChannelLabel("paymaya"), "Maya");
  assert.equal(payMongoChannelLabel("card"), "Card");
});

test("PayMongo receipt details preserve channel and exact paid_at time", () => {
  const rawBody = JSON.stringify({
    data: {
      id: "evt_test",
      type: "checkout_session.payment.paid",
      data: {
        id: "cs_test",
        attributes: {
          payments: [{
            id: "pay_test",
            attributes: {
              status: "paid",
              paid_at: 1786235525,
              source: { type: "qrph" },
            },
          }],
        },
      },
    },
  });

  const details = extractPayMongoReceiptDetails(rawBody);
  assert.equal(details?.gatewayPaymentId, "pay_test");
  assert.equal(details?.sourceType, "qrph");
  assert.equal(details?.paymentChannel, "QR PH");
  assert.equal(details?.paidAt?.toISOString(), new Date(1786235525 * 1000).toISOString());
});
