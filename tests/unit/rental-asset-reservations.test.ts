import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const migration = source("prisma/migrations/20260905153000_rental_asset_reservations/migration.sql");
const actions = source("lib/actions/rental-reservations.ts");
const service = source("lib/services/rental-reservations.ts");
const portalPage = source("app/portal/rentals/page.tsx");
const navigation = source("lib/homeowner-navigation.ts");
const adminActions = source("components/rental-record-actions.tsx");

test("rental reservation migration enforces one ACTIVE hold per tenant asset at the database layer", () => {
  assert.match(migration, /CREATE TABLE `RentalAssetReservation`/);
  assert.match(migration, /`activeAssetKey` VARCHAR\(191\) NULL/);
  assert.match(migration, /UNIQUE INDEX `RentalAssetReservation_tenantId_activeAssetKey_key` \(`tenantId`,`activeAssetKey`\)/);
  assert.match(migration, /FOREIGN KEY \(`tenantId`,`assetId`\) REFERENCES `RentalAsset`\(`tenantId`,`id`\)/);
  assert.match(migration, /FOREIGN KEY \(`tenantId`,`homeownerId`\) REFERENCES `HomeownerProfile`\(`tenantId`,`id`\)/);
});

test("homeowner reservation mutations are tenant-scoped, serialized, locked, idempotent, and audited", () => {
  assert.match(actions, /requireHomeownerProfile\(\)/);
  assert.ok(actions.includes("WHERE tenantId=${profile.tenantId} AND id=${assetId}"));
  assert.ok(actions.includes("WHERE tenantId=${profile.tenantId} AND assetId=${assetId} AND status='ACTIVE'"));
  assert.match(actions, /FOR UPDATE/);
  assert.match(actions, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(actions, /active\.homeownerId === profile\.id/);
  assert.match(actions, /'ACTIVE',\$\{assetId\},NOW\(3\)/);
  assert.match(actions, /activeAssetKey=NULL/);
  assert.match(actions, /CREATE_RENTAL_ASSET_RESERVATION/);
  assert.match(actions, /CANCEL_RENTAL_ASSET_RESERVATION/);
  assert.ok(actions.includes("WHERE tenantId=${profile.tenantId} AND id=${reservationId} AND homeownerId=${profile.id} AND status='ACTIVE'"));
});

test("homeowner rental inventory exposes only tenant AVAILABLE assets and never renders another homeowner identity", () => {
  assert.ok(portalPage.includes("WHERE ra.tenantId=${profile.tenantId} AND ra.status='AVAILABLE'"));
  assert.match(portalPage, /reservationHomeownerId === profile\.id/);
  assert.doesNotMatch(portalPage, /reservationHomeownerName/);
  assert.match(portalPage, /reserveRentalAssetAction/);
  assert.match(portalPage, /cancelRentalAssetReservationAction/);
  assert.match(portalPage, /Reserved by you/);
  assert.match(portalPage, /Reserved/);
});

test("rental reservations are discoverable only with BILLING entitlement and remain under Payments navigation", () => {
  assert.match(navigation, /"\/portal\/rentals"/);
  assert.match(navigation, /href: "\/portal\/rentals", label: "Rental reservations"[\s\S]*module: TenantModule\.BILLING/);
  assert.match(navigation, /prefixes: \[[^\]]*"\/portal\/rentals"/);
});

test("Admin Rental Asset actions surface reservation owner/status using a tenant-scoped read", () => {
  assert.match(adminActions, /getAdminRentalAssetReservationSummary\(asset\.id\)/);
  assert.match(adminActions, /Reserved · \{reservation\.status\}/);
  assert.match(adminActions, /reservation\.homeownerName/);
  assert.ok(service.includes("WHERE ra.tenantId=${admin.tenantId} AND ra.id=${assetId}"));
  assert.ok(service.includes("active.status='ACTIVE'"));
  assert.match(service, /Permission\.BILLING_READ/);
});
