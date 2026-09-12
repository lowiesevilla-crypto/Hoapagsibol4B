import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/settings/email-delivery/page.tsx", "utf8");
const loading = readFileSync("app/admin/settings/email-delivery/loading.tsx", "utf8");
const action = readFileSync("lib/actions/email-delivery-management.ts", "utf8");
const helper = readFileSync("lib/email-delivery-management.ts", "utf8");
const bulkUi = readFileSync("components/email-delivery-bulk-actions.tsx", "utf8");
const links = readFileSync("components/sidebar-links.ts", "utf8");

test("email delivery filters remain tenant and email-channel scoped", () => {
  assert.match(helper, /tenantId,/);
  assert.match(helper, /channel:\s*NotificationChannel\.EMAIL/);
  assert.match(helper, /subject:\s*\{ contains: filters\.q \}/);
  assert.match(helper, /recipient:\s*\{\s*is:\s*\{ name:\s*\{ contains: filters\.q \}/);
  assert.match(helper, /recipient:\s*\{\s*is:\s*\{ email:\s*\{ contains: filters\.q \}/);
});

test("email delivery table uses bounded server-side pagination and lightweight selects", () => {
  assert.match(page, /parseEmailDeliveryPageSize\(query\.pageSize\)/);
  assert.match(page, /skip:\s*\(page - 1\) \* pageSize/);
  assert.match(page, /take:\s*pageSize/);
  assert.match(helper, /EMAIL_DELIVERY_PAGE_SIZES = \[25, 50, 100\]/);
  assert.match(page, /select:\s*\{/);
  assert.match(page, /Server-side pagination/);
});

test("email history prefers the delivery-time masked recipient snapshot", () => {
  assert.match(page, /metadata:\s*true/);
  assert.match(page, /function deliveryEmailSnapshot/);
  assert.match(page, /Prisma\.JsonObject\)\.maskedEmail/);
  assert.match(page, /deliveryEmailSnapshot\(log\.metadata, log\.recipient\.email\)/);
  assert.match(page, /return maskedEmail\(currentEmail\)/);
});

test("single retry stays concurrency-safe, tenant-scoped, and never bypasses the protected worker", () => {
  assert.match(action, /requirePermission\(Permission\.SETTINGS_MANAGE\)/);
  assert.match(action, /tenantId:\s*admin\.tenantId/);
  assert.match(action, /channel:\s*NotificationChannel\.EMAIL/);
  assert.match(action, /status:\s*NotificationStatus\.FAILED/);
  assert.match(action, /type:\s*\{\s*in:\s*RETRYABLE_EMAIL_TYPES\s*\}/);
  assert.match(action, /retryAttempts:\s*0/);
  assert.match(action, /update\.count !== 1/);
  assert.match(action, /action:\s*"REQUEUE_FAILED_EMAIL"/);
  assert.match(action, /directSmtpSend:\s*false/);
  assert.doesNotMatch(action, /nodemailer|sendProtectedRawEmail|sendMail\(/);
});

test("bulk resend supports page or all-filtered selection without direct SMTP", () => {
  assert.match(action, /selectAllFiltered/);
  assert.match(action, /emailDeliveryWhere\(admin\.tenantId, filters\)/);
  assert.match(action, /\.slice\(0, 100\)/);
  assert.match(action, /type:\s*\{ in: RETRYABLE_EMAIL_TYPES \}/);
  assert.match(action, /status:\s*\{ in:\s*\[NotificationStatus\.QUEUED, NotificationStatus\.FAILED\] \}/);
  assert.match(action, /action:\s*"BULK_REQUEUE_EMAILS"/);
  assert.match(action, /directSmtpSend:\s*false/);
  assert.doesNotMatch(action, /nodemailer|sendProtectedRawEmail|sendMail\(/);
});

test("delete from queue is a tenant-safe soft removal that preserves audit history", () => {
  assert.match(action, /selectionWhere/);
  assert.match(action, /status:\s*NotificationStatus\.QUEUED/);
  assert.match(action, /status:\s*NotificationStatus\.SKIPPED/);
  assert.match(action, /action:\s*"BULK_REMOVE_QUEUED_EMAILS"/);
  assert.match(action, /hardDeleted:\s*false/);
  assert.match(action, /Audit history was retained/);
  assert.doesNotMatch(action, /notificationLog\.delete|notificationLog\.deleteMany/);
});

test("bulk UI exposes page selection, all-filtered selection, confirmations, and loading feedback", () => {
  assert.match(page, /EmailDeliverySelectPage/);
  assert.match(page, /name="selectAllFiltered"/);
  assert.match(page, /name="notificationIds"/);
  assert.match(page, /Resend \/ Retry/);
  assert.match(page, /Delete from queue/);
  assert.match(bulkUi, /useFormStatus/);
  assert.match(bulkUi, /Processing…/);
  assert.match(bulkUi, /window\.confirm/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /animate-pulse/);
});

test("sent and unsupported records remain history-only", () => {
  assert.match(page, /NotificationStatus\.SENT\s*\? "Read only"/);
  assert.match(page, /"History only"/);
  assert.match(helper, /NotificationType\.BILLING_NOTIFICATION/);
  assert.match(helper, /NotificationType\.BILL_REMINDER/);
});

test("system admin navigation exposes the email delivery management screen", () => {
  assert.match(links, /href:\s*"\/admin\/settings\/email-delivery"/);
  assert.match(links, /label:\s*"Email Delivery"/);
});
