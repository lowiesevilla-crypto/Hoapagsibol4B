import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const migration = source("prisma/migrations/20260906083000_rental_agreement_contract_documents/migration.sql");
const service = source("lib/services/rental-agreement-contracts.ts");
const rentalActions = source("lib/actions/rentals.ts");
const uploadAction = source("lib/actions/rental-agreement-contracts.ts");
const contractRoute = source("app/api/rentals/agreements/[id]/contract/route.ts");
const signedRoute = source("app/api/rentals/agreements/[id]/signed/route.ts");
const adminPage = source("app/admin/rentals/agreements/[id]/page.tsx");
const portalPage = source("app/portal/rentals/page.tsx");
const morePage = source("app/portal/more/page.tsx");

test("rental contract migration creates immutable tenant-scoped documents and backfills existing agreements without privileged triggers", () => {
  assert.match(migration, /CREATE TABLE `RentalAgreementDocument`/);
  assert.match(migration, /UNIQUE INDEX `RentalAgreementDocument_tenantId_agreementId_version_key` \(`tenantId`,`agreementId`,`version`\)/);
  assert.match(migration, /FOREIGN KEY \(`tenantId`,`agreementId`\) REFERENCES `RentalAgreement`\(`tenantId`,`id`\)/);
  assert.match(migration, /Backfill all existing agreements/);
  assert.match(migration, /INSERT INTO `RentalAgreementDocument`[\s\S]*FROM `RentalAgreement` a/);
  assert.doesNotMatch(migration, /CREATE\s+TRIGGER/i);
  assert.match(migration, /does not require MySQL SUPER privileges/);
});

test("agreement activation fulfills the matching homeowner reservation inside the existing serialized transaction", () => {
  assert.match(rentalActions, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.ok(rentalActions.includes("WHERE tenantId=${admin.tenantId} AND assetId=${assetId} AND status='ACTIVE'"));
  assert.match(rentalActions, /FOR UPDATE/);
  assert.match(rentalActions, /reservation\.homeownerId !== renter\.homeownerId/);
  assert.match(rentalActions, /SET status='FULFILLED',activeAssetKey=NULL,fulfilledAt=NOW\(3\),updatedAt=NOW\(3\)/);
  assert.ok(rentalActions.includes("WHERE tenantId=${admin.tenantId} AND id=${reservation.id} AND assetId=${assetId}"));
  assert.ok(rentalActions.includes("AND homeownerId=${renter.homeownerId} AND status='ACTIVE'"));
  assert.match(rentalActions, /FULFILL_RENTAL_ASSET_RESERVATION/);
  assert.match(rentalActions, /createRentalAgreementContractSnapshot\(db/);
  assert.match(rentalActions, /tenantId: admin\.tenantId/);
  assert.match(rentalActions, /agreementId/);
  assert.match(rentalActions, /generatedById: admin\.id/);
});

test("contract access is tenant-scoped and homeowner access is restricted to the linked renter", () => {
  assert.ok(service.includes("WHERE a.tenantId=${input.tenantId} AND a.id=${input.agreementId}"));
  assert.match(service, /access\.renterHomeownerId === input\.homeownerId/);
  assert.match(service, /if \(!input\.canReadAllRentalAgreements && !homeownerOwnsAgreement\) return null/);
  assert.match(contractRoute, /user\.homeownerProfile\?\.id/);
  assert.match(contractRoute, /user\.permissions\.includes\(Permission\.BILLING_READ\)/);
  assert.match(signedRoute, /user\.homeownerProfile\?\.id/);
  assert.match(signedRoute, /user\.permissions\.includes\(Permission\.BILLING_READ\)/);
});

test("generated contract supports printable HTML, PDF and Word from one frozen snapshot", () => {
  assert.match(service, /RentalAgreementContractSnapshot/);
  assert.match(service, /renderRentalAgreementContractHtml/);
  assert.match(service, /renderRentalAgreementContractPdf/);
  assert.match(service, /renderRentalAgreementContractDocx/);
  assert.match(service, /laws of the Republic of the Philippines/);
  assert.match(contractRoute, /format === "docx" \|\| format === "word"/);
  assert.match(contractRoute, /format === "html" \|\| format === "print"/);
  assert.match(contractRoute, /format !== "pdf"/);
});

test("signed contract upload is type, signature, size, hash and tenant-storage protected", () => {
  assert.match(uploadAction, /15 \* 1024 \* 1024/);
  assert.match(uploadAction, /application\/pdf/);
  assert.match(uploadAction, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
  assert.match(uploadAction, /verifyFileSignature/);
  assert.match(uploadAction, /tenantUploadDirectory\(admin\.tenant\.slug, "rentals", agreementId, "signed"\)/);
  assert.match(uploadAction, /createHash\("sha256"\)/);
  assert.match(uploadAction, /WHERE tenantId=\$\{admin\.tenantId\} AND id=\$\{contract\.id\} AND agreementId=\$\{agreementId\}/);
  assert.match(uploadAction, /UPLOAD_SIGNED_RENTAL_AGREEMENT/);
});

test("admin agreement screen exposes generated contract actions and signed upload", () => {
  assert.match(adminPage, /Rental Agreement Contract/);
  assert.match(adminPage, /contract\?format=pdf/);
  assert.match(adminPage, /contract\?format=docx/);
  assert.match(adminPage, /contract\?format=print/);
  assert.match(adminPage, /uploadSignedRentalAgreementAction/);
  assert.match(adminPage, /signedAgreement/);
  assert.match(adminPage, /Number\(agreement\.invoiceCount\) === 0 && !contract/);
});

test("homeowner rental screen exposes only the homeowner's linked agreements and contract downloads", () => {
  assert.ok(portalPage.includes("WHERE a.tenantId=${profile.tenantId}"));
  assert.ok(portalPage.includes("renter.homeownerId=${profile.id}"));
  assert.match(portalPage, /My rental agreements/);
  assert.match(portalPage, /contract\?format=pdf/);
  assert.match(portalPage, /contract\?format=docx/);
  assert.match(portalPage, /contract\?format=print/);
  assert.match(portalPage, /Signed copy/);
});

test("mobile homeowner More screen makes Rentals & Contracts directly discoverable when Billing is enabled", () => {
  assert.match(morePage, /enabledModules\.has\(TenantModule\.BILLING\)/);
  assert.match(morePage, /href: "\/portal\/rentals"/);
  assert.match(morePage, /label: "Rentals & Contracts"/);
});
