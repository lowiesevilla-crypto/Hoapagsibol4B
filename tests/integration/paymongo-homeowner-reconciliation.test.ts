import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PaymentMethod, PaymentRequestStatus, PaymentRequestType, Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";
import { reconcileHomeownerPayMongoCheckout } from "@/lib/services/homeowner-paymongo-reconciliation";

const runId = `paymongo-it-${process.pid}`;
const tenantId = `${runId}-tenant`;
const homeownerUserId = `${runId}-user`;
const homeownerId = `${runId}-homeowner`;
const linkedAccountId = `org_${runId}`;
const originalSecret = process.env.PAYMONGO_HOMEOWNER_SECRET_KEY;
const originalFetch = globalThis.fetch;
const checkoutPayloads = new Map<string, unknown>();

function checkoutId(month: number) { return `cs_${runId}_${month}`; }
function requestId(month: number) { return `${runId}-request-${month}`; }
function billId(month: number) { return `${runId}-bill-${month}`; }

function checkoutFixture(month: number, options: {
  checkoutStatus?: "active" | "expired";
  paymentIntentStatus?: "awaiting_payment_method" | "awaiting_next_action" | "processing" | "succeeded";
  lastPaymentError?: unknown;
  paid?: boolean;
  referenceNumber?: string;
}) {
  const attributes: Record<string, unknown> = {
    status: options.checkoutStatus || "active",
    reference_number: options.referenceNumber || `HOP-${requestId(month)}`,
    metadata: {
      tenantId,
      homeownerId,
      paymentRequestId: requestId(month),
      principalAmountCentavos: "100000",
      platformFeeCentavos: "0",
      baseChargeCentavos: "100000",
      passOnProcessingFees: "false",
    },
    payments: options.paid ? [{
      id: `pay_${runId}_${month}`,
      attributes: {
        status: "paid",
        amount: 100000,
        currency: "PHP",
        paid_at: 1768435200,
        source: { type: "gcash" },
      },
    }] : [],
  };
  if (options.paymentIntentStatus) {
    attributes.payment_intent = {
      id: `pi_${runId}_${month}`,
      attributes: {
        status: options.paymentIntentStatus,
        last_payment_error: options.lastPaymentError ?? null,
      },
    };
  }
  return { id: checkoutId(month), attributes };
}

async function createAttempt(month: number) {
  const billingMonth = new Date(Date.UTC(2026, month - 1, 1));
  const dueDate = new Date(Date.UTC(2026, month - 1, 15));
  await platformPrisma.bill.create({
    data: {
      id: billId(month), tenantId, homeownerId, billingMonth,
      coverageYear: 2026, coverageMonth: month,
      amount: 1000, totalAmount: 1000, balance: 1000, dueDate,
    },
  });
  await platformPrisma.paymentRequest.create({
    data: {
      id: requestId(month), tenantId, homeownerId, billId: billId(month),
      type: PaymentRequestType.MONTHLY_DUES,
      amount: 1000, paymentDate: billingMonth, method: PaymentMethod.OTHER,
      referenceNumber: `HOP-${requestId(month)}`,
      proofFileName: linkedAccountId,
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
      payerNotes: "PayMongo Online checkout",
    },
  });
  await platformPrisma.auditLog.create({
    data: {
      tenantId, actorId: homeownerUserId, module: "PAYMENTS",
      action: "CREATE_PAYMONGO_HOMEOWNER_CHECKOUT",
      entityType: "PaymentRequest", entityId: requestId(month), correlationId: checkoutId(month),
    },
  });
}

async function cleanFixtures() {
  await platformPrisma.notificationLog.deleteMany({ where: { tenantId } });
  await platformPrisma.auditLog.deleteMany({ where: { tenantId } });
  await platformPrisma.paymentAllocation.deleteMany({ where: { tenantId } });
  await platformPrisma.paymentRequest.deleteMany({ where: { tenantId } });
  await platformPrisma.payment.deleteMany({ where: { tenantId } });
  await platformPrisma.receiptCounter.deleteMany({ where: { tenantId } });
  await platformPrisma.bill.deleteMany({ where: { tenantId } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId } });
  await platformPrisma.userRoleAssignment.deleteMany({ where: { tenantId } });
  await platformPrisma.user.deleteMany({ where: { tenantId } });
  await platformPrisma.tenant.deleteMany({ where: { id: tenantId } });
}

before(async () => {
  await cleanFixtures();
  process.env.PAYMONGO_HOMEOWNER_SECRET_KEY = "sk_test_integration_only_not_a_real_secret";
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const id = decodeURIComponent(url.split("/").pop() || "");
    const payload = checkoutPayloads.get(id);
    if (!payload) return new Response(JSON.stringify({ errors: [{ detail: "Checkout fixture not found" }] }), { status: 404, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ data: payload }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await platformPrisma.tenant.create({ data: { id: tenantId, name: "PayMongo Integration HOA", shortName: "PM-IT", slug: `${runId}-hoa` } });
  await platformPrisma.user.create({
    data: {
      id: homeownerUserId, tenantId, name: "PayMongo Test Homeowner",
      email: `${runId}@example.invalid`, passwordHash: "integration-test-only", role: Role.HOMEOWNER,
    },
  });
  await platformPrisma.homeownerProfile.create({
    data: {
      id: homeownerId, tenantId, userId: homeownerUserId,
      address: "Integration Test Property", block: "PM", lot: "001",
      phone: "09000000001", monthlyDuesAmount: 1000,
    },
  });
});

after(async () => {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.PAYMONGO_HOMEOWNER_SECRET_KEY;
  else process.env.PAYMONGO_HOMEOWNER_SECRET_KEY = originalSecret;
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("successful PayMongo payment automatically posts receipt and reconciles the bill exactly once", async () => {
  const month = 1;
  await createAttempt(month);
  checkoutPayloads.set(checkoutId(month), checkoutFixture(month, { paymentIntentStatus: "succeeded", paid: true }));

  const first = await reconcileHomeownerPayMongoCheckout({ requestId: requestId(month), tenantId, homeownerId });
  assert.equal(first.state, "PAID");
  assert.equal(first.financeStatus, "RECONCILED");

  const [request, payment, bill] = await Promise.all([
    platformPrisma.paymentRequest.findUniqueOrThrow({ where: { id: requestId(month) } }),
    platformPrisma.payment.findFirstOrThrow({ where: { tenantId, homeownerId, billId: billId(month) } }),
    platformPrisma.bill.findUniqueOrThrow({ where: { id: billId(month) } }),
  ]);
  assert.equal(request.status, PaymentRequestStatus.APPROVED);
  assert.equal(request.paymentId, payment.id);
  assert.equal(payment.method, PaymentMethod.GCASH);
  assert.ok(payment.receiptNumber, "a reconciled PayMongo payment must have an HOAHub receipt number");
  assert.equal(Number(bill.amountPaid), 1000);
  assert.equal(Number(bill.balance), 0);
  assert.equal(bill.status, "PAID");

  const repeated = await reconcileHomeownerPayMongoCheckout({ requestId: requestId(month), tenantId, homeownerId });
  assert.equal(repeated.state, "PAID");
  assert.equal(await platformPrisma.payment.count({ where: { tenantId, homeownerId, billId: billId(month) } }), 1);
});

test("processing PayMongo payment remains pending and never posts finance", async () => {
  const month = 2;
  await createAttempt(month);
  checkoutPayloads.set(checkoutId(month), checkoutFixture(month, { paymentIntentStatus: "processing" }));

  const result = await reconcileHomeownerPayMongoCheckout({ requestId: requestId(month), tenantId, homeownerId });
  assert.equal(result.state, "PROCESSING");
  assert.equal(result.financeStatus, "NOT_POSTED");
  const request = await platformPrisma.paymentRequest.findUniqueOrThrow({ where: { id: requestId(month) } });
  assert.equal(request.status, PaymentRequestStatus.PENDING_REVIEW);
  assert.equal(request.reviewRemarks, "PAYMONGO_GATEWAY_STATE:PROCESSING");
  assert.equal(await platformPrisma.payment.count({ where: { tenantId, billId: billId(month) } }), 0);
});

test("failed PayMongo attempt is retryable while checkout remains active and does not post finance", async () => {
  const month = 3;
  await createAttempt(month);
  checkoutPayloads.set(checkoutId(month), checkoutFixture(month, {
    paymentIntentStatus: "awaiting_payment_method",
    lastPaymentError: { failed_message: "declined" },
  }));

  const result = await reconcileHomeownerPayMongoCheckout({ requestId: requestId(month), tenantId, homeownerId });
  assert.equal(result.state, "FAILED_RETRYABLE");
  assert.equal(result.canResume, true);
  assert.equal(result.financeStatus, "NOT_POSTED");
  const request = await platformPrisma.paymentRequest.findUniqueOrThrow({ where: { id: requestId(month) } });
  assert.equal(request.status, PaymentRequestStatus.PENDING_REVIEW);
  assert.equal(request.reviewRemarks, "PAYMONGO_GATEWAY_STATE:FAILED_RETRYABLE");
  assert.equal(await platformPrisma.payment.count({ where: { tenantId, billId: billId(month) } }), 0);
});

test("expired PayMongo checkout becomes rejected and cannot create a finance payment", async () => {
  const month = 4;
  await createAttempt(month);
  checkoutPayloads.set(checkoutId(month), checkoutFixture(month, { checkoutStatus: "expired" }));

  const result = await reconcileHomeownerPayMongoCheckout({ requestId: requestId(month), tenantId, homeownerId });
  assert.equal(result.state, "EXPIRED");
  assert.equal(result.financeStatus, "NOT_POSTED");
  const request = await platformPrisma.paymentRequest.findUniqueOrThrow({ where: { id: requestId(month) } });
  assert.equal(request.status, PaymentRequestStatus.REJECTED);
  assert.equal(request.reviewRemarks, "PAYMONGO_GATEWAY_STATE:EXPIRED");
  assert.equal(await platformPrisma.payment.count({ where: { tenantId, billId: billId(month) } }), 0);
});

test("PayMongo reference mismatch fails closed without finance posting", async () => {
  const month = 5;
  await createAttempt(month);
  checkoutPayloads.set(checkoutId(month), checkoutFixture(month, {
    paymentIntentStatus: "succeeded", paid: true, referenceNumber: "HOP-wrong-request",
  }));

  await assert.rejects(
    () => reconcileHomeownerPayMongoCheckout({ requestId: requestId(month), tenantId, homeownerId }),
    /reference does not match/,
  );
  assert.equal(await platformPrisma.payment.count({ where: { tenantId, billId: billId(month) } }), 0);
  const request = await platformPrisma.paymentRequest.findUniqueOrThrow({ where: { id: requestId(month) } });
  assert.equal(request.status, PaymentRequestStatus.PENDING_REVIEW);
});
