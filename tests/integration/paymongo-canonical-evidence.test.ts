import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { CollectionType, PaymentMethod, PaymentRequestStatus, PaymentRequestType, Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";
import { getPayMongoCanonicalEvidence, getPayMongoCanonicalEvidenceBatch } from "@/lib/services/paymongo-canonical-evidence";
import { approvePaymentRequest } from "@/lib/services/payment-requests";

const runId = `paymongo-evidence-${process.pid}`;
const tenantId = `${runId}-tenant`;
const adminId = `${runId}-admin`;
const homeownerUserId = `${runId}-homeowner-user`;
const homeownerId = `${runId}-homeowner`;

const collectionTypes = [
  CollectionType.GATE_PASS,
  CollectionType.STICKER,
  CollectionType.MEMBERSHIP,
  CollectionType.CONSTRUCTION_BOND,
  CollectionType.OTHER,
] as const;

function requestId(type: CollectionType) {
  return `${runId}-${type.toLowerCase()}`;
}

async function cleanFixtures() {
  await platformPrisma.auditLog.deleteMany({ where: { tenantId } });
  await platformPrisma.paymentRequest.deleteMany({ where: { tenantId } });
  await platformPrisma.bondRefund.deleteMany({ where: { tenantId } });
  await platformPrisma.collection.deleteMany({ where: { tenantId } });
  await platformPrisma.receiptCounter.deleteMany({ where: { tenantId } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId } });
  await platformPrisma.userRoleAssignment.deleteMany({ where: { tenantId } });
  await platformPrisma.user.deleteMany({ where: { tenantId } });
  await platformPrisma.tenant.deleteMany({ where: { id: tenantId } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.create({ data: { id: tenantId, name: "PayMongo Evidence HOA", shortName: "PM-EV", slug: `${runId}-hoa` } });
  await platformPrisma.user.create({
    data: {
      id: adminId,
      tenantId,
      name: "Evidence Admin",
      email: `${runId}-admin@example.invalid`,
      passwordHash: "integration-test-only",
      role: Role.ADMIN,
    },
  });
  await platformPrisma.user.create({
    data: {
      id: homeownerUserId,
      tenantId,
      name: "Evidence Homeowner",
      email: `${runId}-homeowner@example.invalid`,
      passwordHash: "integration-test-only",
      role: Role.HOMEOWNER,
    },
  });
  await platformPrisma.homeownerProfile.create({
    data: {
      id: homeownerId,
      tenantId,
      userId: homeownerUserId,
      address: "Evidence Property",
      block: "EV",
      lot: "001",
      phone: "09000000002",
      monthlyDuesAmount: 1000,
    },
  });
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("all homeowner PayMongo collection types require and expose canonical collection receipts", async () => {
  for (const [index, collectionType] of collectionTypes.entries()) {
    const id = requestId(collectionType);
    await platformPrisma.paymentRequest.create({
      data: {
        id,
        tenantId,
        homeownerId,
        type: PaymentRequestType.OTHER_COLLECTION,
        collectionType,
        description: collectionType === CollectionType.OTHER ? "Special assessment" : null,
        amount: 100 + index,
        paymentDate: new Date(Date.UTC(2026, 7, 30)),
        method: PaymentMethod.GCASH,
        referenceNumber: `HOP-${id}`,
        proofFileName: `org_${runId}`,
        proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
        payerNotes: "PayMongo Online checkout",
      },
    });

    const approved = await approvePaymentRequest(
      id,
      adminId,
      "Automatically reconciled from verified PayMongo Checkout Session.",
      tenantId,
      { allowGatewayConfirmation: true },
    );
    assert.equal(approved.status, PaymentRequestStatus.APPROVED);
    assert.ok(approved.collectionId, `${collectionType} must link to a collection`);

    const collection = await platformPrisma.collection.findFirstOrThrow({
      where: { id: approved.collectionId!, tenantId, homeownerId },
    });
    assert.equal(collection.type, collectionType);
    assert.ok(collection.receiptNumber, `${collectionType} must allocate a receipt`);
    assert.equal(await platformPrisma.collection.count({ where: { tenantId, id: collection.id } }), 1);

    const evidence = await getPayMongoCanonicalEvidence({ requestId: id, tenantId, homeownerId });
    assert.equal(evidence.reconciled, true);
    assert.deepEqual(evidence.receipts, [{ kind: "collection", id: collection.id, receiptNumber: collection.receiptNumber! }]);
  }
});

test("APPROVED PayMongo request without canonical linked receipt is not reconciled", async () => {
  const id = `${runId}-false-positive`;
  await platformPrisma.paymentRequest.create({
    data: {
      id,
      tenantId,
      homeownerId,
      type: PaymentRequestType.OTHER_COLLECTION,
      collectionType: CollectionType.STICKER,
      amount: 250,
      paymentDate: new Date(Date.UTC(2026, 7, 30)),
      method: PaymentMethod.GCASH,
      referenceNumber: `HOP-${id}`,
      proofFileName: `org_${runId}`,
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
      payerNotes: "PayMongo Online checkout",
      status: PaymentRequestStatus.APPROVED,
      reviewedAt: new Date(),
    },
  });

  const evidence = await getPayMongoCanonicalEvidence({ requestId: id, tenantId, homeownerId });
  assert.equal(evidence.reconciled, false);
  assert.deepEqual(evidence.receipts, []);

  const batch = await getPayMongoCanonicalEvidenceBatch({ requestIds: [id], tenantId });
  assert.equal(batch.get(id)?.reconciled, false);
});
