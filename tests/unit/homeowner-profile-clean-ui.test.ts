import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/portal/profile/page.tsx", "utf8");
const uploader = readFileSync("components/homeowner/profile-photo-uploader.tsx", "utf8");
const photoRoute = readFileSync("app/api/profile/photo/route.ts", "utf8");
const photoService = readFileSync("lib/services/homeowner-profile-photo.ts", "utf8");
const migration = readFileSync("prisma/migrations/20260816090000_homeowner_profile_photo/migration.sql", "utf8");

test("homeowner profile uses a compact mobile-first hierarchy", () => {
  assert.match(page, /ProfilePhotoUploader/);
  assert.match(page, /grid grid-cols-2 gap-2/);
  assert.match(page, /<details className="group overflow-hidden rounded-3xl/);
  assert.match(page, /Home & household/);
  assert.match(page, /Security/);
  assert.match(page, /linkedAccounts\.length > 1/);
  assert.doesNotMatch(page, /PageHeader/);
  assert.doesNotMatch(page, /InfoTile/);
  assert.doesNotMatch(page, /Contact your HOA administrator to request corrections/);
  assert.doesNotMatch(page, /Accounts are linked by your verified email address/);
});

test("homeowners can upload or remove a profile photo with phone-safe controls", () => {
  assert.match(uploader, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(uploader, /5 \* 1024 \* 1024/);
  assert.match(uploader, /\/api\/profile\/photo/);
  assert.match(uploader, /Change photo/);
  assert.match(uploader, /Add photo/);
  assert.match(uploader, /Remove/);
  assert.match(uploader, /size-20/);
});

test("profile photo storage is authenticated, tenant-scoped, and validates real image signatures", () => {
  assert.match(photoRoute, /requireUser\(Role\.HOMEOWNER\)/);
  assert.match(photoRoute, /tenantUploadDirectory\(tenantSlug, "profile", safeUserId\)/);
  assert.match(photoRoute, /matchesImageSignature/);
  assert.match(photoRoute, /image\/jpeg/);
  assert.match(photoRoute, /image\/png/);
  assert.match(photoRoute, /image\/webp/);
  assert.match(photoRoute, /X-Content-Type-Options/);
  assert.match(photoRoute, /writeAuditLog/);
  assert.match(photoService, /WHERE tenantId = \$\{tenantId\} AND userId = \$\{userId\}/);
  assert.match(photoService, /ON DUPLICATE KEY UPDATE/);
  assert.match(migration, /UNIQUE KEY `HomeownerProfilePhoto_tenantId_userId_key` \(`tenantId`, `userId`\)/);
});
