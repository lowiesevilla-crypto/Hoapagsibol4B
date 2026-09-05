import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { Prisma, Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";

const runId = `rental-reservation-it-${process.pid}`;
const tenantA = `${runId}-a`;
const tenantB = `${runId}-b`;
const homeownerA1 = `${runId}-homeowner-a1`;
const homeownerA2 = `${runId}-homeowner-a2`;
const homeownerB1 = `${runId}-homeowner-b1`;
const userA1 = `${runId}-user-a1`;
const userA2 = `${runId}-user-a2`;
const userB1 = `${runId}-user-b1`;
const assetA1 = `${runId}-asset-a1`;
const assetA2 = `${runId}-asset-a2`;
const assetB1 = `${runId}-asset-b1`;

async function cleanFixtures() {
  await platformPrisma.$executeRaw(Prisma.sql`DELETE FROM RentalAssetReservation WHERE tenantId IN (${tenantA},${tenantB})`);
  await platformPrisma.$executeRaw(Prisma.sql`DELETE FROM RentalAsset WHERE tenantId IN (${tenantA},${tenantB})`);
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await platformPrisma.user.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
}

async function createHomeowner(tenantId: string, userId: string, homeownerId: string, suffix: string) {
  await platformPrisma.user.create({
    data: {
      id: userId,
      tenantId,
      name: `Reservation Homeowner ${suffix}`,
      email: `${runId}-${suffix.toLowerCase()}@example.invalid`,
      passwordHash: "integration-test-only",
      role: Role.HOMEOWNER,
    },
  });
  await platformPrisma.homeownerProfile.create({
    data: {
      id: homeownerId,
      tenantId,
      userId,
      address: `${suffix} Reservation Test Street`,
      block: `B-${suffix}`,
      lot: `L-${suffix}`,
      phone: `0900000${suffix.replace(/\D/g, "").padStart(4, "0")}`,
      monthlyDuesAmount: new Prisma.Decimal("500.00"),
    },
  });
}

async function createAsset(tenantId: string, id: string, code: string) {
  await platformPrisma.$executeRaw(Prisma.sql`
    INSERT INTO RentalAsset (tenantId,id,code,name,type,location,defaultRate,status,notes,createdAt,updatedAt)
    VALUES (${tenantId},${id},${code},${`Reservation Test ${code}`},'PARKING','Integration test',750,'AVAILABLE',NULL,NOW(3),NOW(3))
  `);
}

async function insertReservation(tenantId: string, assetId: string, homeownerId: string) {
  const id = randomUUID();
  await platformPrisma.$executeRaw(Prisma.sql`
    INSERT INTO RentalAssetReservation (tenantId,id,assetId,homeownerId,status,activeAssetKey,reservedAt,createdAt,updatedAt)
    VALUES (${tenantId},${id},${assetId},${homeownerId},'ACTIVE',${assetId},NOW(3),NOW(3),NOW(3))
  `);
  return id;
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.createMany({
    data: [
      { id: tenantA, name: "Rental Reservation Tenant A", shortName: "RRA", slug: `${runId}-a` },
      { id: tenantB, name: "Rental Reservation Tenant B", shortName: "RRB", slug: `${runId}-b` },
    ],
  });
  await createHomeowner(tenantA, userA1, homeownerA1, "A1");
  await createHomeowner(tenantA, userA2, homeownerA2, "A2");
  await createHomeowner(tenantB, userB1, homeownerB1, "B1");
  await createAsset(tenantA, assetA1, "A-PARK-01");
  await createAsset(tenantA, assetA2, "A-PARK-02");
  await createAsset(tenantB, assetB1, "B-PARK-01");
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("database enforces one active rental reservation per asset and tenant-scoped foreign keys", async () => {
  const concurrent = await Promise.allSettled([
    insertReservation(tenantA, assetA1, homeownerA1),
    insertReservation(tenantA, assetA1, homeownerA2),
  ]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1, "Exactly one concurrent reservation must win.");
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1, "The competing reservation must be rejected by the database invariant.");

  const activeA1 = await platformPrisma.$queryRaw<Array<{ id: string; homeownerId: string }>>(Prisma.sql`
    SELECT id,homeownerId FROM RentalAssetReservation
    WHERE tenantId=${tenantA} AND assetId=${assetA1} AND status='ACTIVE'
  `);
  assert.equal(activeA1.length, 1);
  const firstWinner = activeA1[0]!;
  const nextHomeowner = firstWinner.homeownerId === homeownerA1 ? homeownerA2 : homeownerA1;

  await platformPrisma.$executeRaw(Prisma.sql`
    UPDATE RentalAssetReservation
    SET status='CANCELLED',activeAssetKey=NULL,cancelledAt=NOW(3),updatedAt=NOW(3)
    WHERE tenantId=${tenantA} AND id=${firstWinner.id}
  `);
  const replacementId = await insertReservation(tenantA, assetA1, nextHomeowner);
  const replacement = await platformPrisma.$queryRaw<Array<{ id: string; homeownerId: string; status: string }>>(Prisma.sql`
    SELECT id,homeownerId,status FROM RentalAssetReservation
    WHERE tenantId=${tenantA} AND assetId=${assetA1} AND status='ACTIVE'
  `);
  assert.deepEqual(replacement, [{ id: replacementId, homeownerId: nextHomeowner, status: "ACTIVE" }]);

  const tenantBReservation = await insertReservation(tenantB, assetB1, homeownerB1);
  const tenantAVisible = await platformPrisma.$queryRaw<Array<{ assetId: string }>>(Prisma.sql`
    SELECT assetId FROM RentalAssetReservation WHERE tenantId=${tenantA} AND status='ACTIVE' ORDER BY assetId
  `);
  const tenantBVisible = await platformPrisma.$queryRaw<Array<{ id: string; assetId: string }>>(Prisma.sql`
    SELECT id,assetId FROM RentalAssetReservation WHERE tenantId=${tenantB} AND status='ACTIVE'
  `);
  assert.deepEqual(tenantAVisible, [{ assetId: assetA1 }]);
  assert.deepEqual(tenantBVisible, [{ id: tenantBReservation, assetId: assetB1 }]);

  await assert.rejects(
    () => insertReservation(tenantA, assetA2, homeownerB1),
    "A homeowner from another tenant must not satisfy the tenant-scoped reservation FK.",
  );
  await assert.rejects(
    () => insertReservation(tenantA, assetB1, homeownerA1),
    "An asset from another tenant must not satisfy the tenant-scoped reservation FK.",
  );
});