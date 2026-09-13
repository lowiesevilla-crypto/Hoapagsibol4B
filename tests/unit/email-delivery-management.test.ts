import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/settings/email-delivery/page.tsx", "utf8");
const loading = readFileSync("app/admin/settings/email-delivery/loading.tsx", "utf8");
const action = readFileSync("lib/actions/email-delivery-management.ts", "utf8");
const helper = readFileSync("lib/email-delivery-management.ts", "utf8");
const bulkUi = readFileSync("components/email-delivery-bulk-actions.tsx", "utf8");
const liveStatus = readFileSync("components/email-delivery-live-status.tsx", "utf8");
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
  assert.match(action, /queueing only, not delivery/);
  assert.doesNotMatch(action, /nodemailer|sendProtectedRawEmail|sendMail\(/);
});

test("bulk success redirect stays outside the database try/catch", () => {
  const bulkStart = action.indexOf("export async function bulkEmailDeliveryAction");
  const tryStart = action.indexOf("  try {", bulkStart);
  const catchStart = action.indexOf("  } catch", tryStart);
  assert.ok(bulkStart >= 0 && tryStart > bulkStart && catchStart > tryStart);
  const protectedBlock = action.slice(tryStart, catchStart);
  assert.doesNotMatch(protectedBlock, /redirect\(/);
  assert.match(action.slice(catchStart), /revalidatePath\("\/admin\/settings\/email-delivery"\)/);
  assert.match(action.slice(catchStart), /redirect\(managementUrl\(\s*"success"/);
});

test("delete from queue accepts any queued email type while preserving tenant-safe audit history", () => {
  const removeStart = action.indexOf('if (bulkAction === "remove")');
  const resendStart = action.indexOf("    } else {", removeStart);
  assert.ok(removeStart >= 0 && resendStart > removeStart);
  const removeBlock = action.slice(removeStart, resendStart);
  assert.match(removeBlock, /selectionWhere/);
  assert.match(removeBlock, /status:\s*NotificationStatus\.QUEUED/);
  assert.doesNotMatch(removeBlock, /type:\s*\{\s*in:\s*RETRYABLE_EMAIL_TYPES/);
  assert.match(removeBlock, /status:\s*NotificationStatus\.SKIPPED/);
  assert.match(removeBlock, /action:\s*"BULK_REMOVE_QUEUED_EMAILS"/);
  assert.match(removeBlock, /removalScope:\s*"ANY_QUEUED_EMAIL"/);
  assert.match(removeBlock, /administratorVisibleDisposition:\s*"REMOVED_FROM_QUEUE"/);
  assert.match(removeBlock, /hardDeleted:\s*false/);
  assert.match(action, /queued email record/);
  assert.doesNotMatch(action, /notificationLog\.delete|notificationLog\.deleteMany/);
});

test("bulk UI lets any queued record be selected for delete while resend stays type-restricted", () => {
  assert.match(page, /EmailDeliverySelectPage count=\{actionableOnPage\}/);
  assert.match(page, /log\.status === NotificationStatus\.QUEUED\s*\|\|\s*\(isProtectedQueueType\(log\.type\) && log\.status === NotificationStatus\.FAILED\)/s);
  assert.match(page, /const actionable = log\.status === NotificationStatus\.QUEUED\s*\|\|\s*\(queueType && log\.status === NotificationStatus\.FAILED\)/s);
  assert.match(page, /Any QUEUED email can be deleted from the queue/);
  assert.match(page, /resend must use its dedicated feature workflow/);
  assert.match(page, /disabled=\{!actionable\}/);
  assert.match(page, /Resend \/ Retry/);
  assert.match(page, /Delete from queue/);
  assert.match(page, /displayStatus = removed \? "REMOVED"/);
  assert.match(page, /Pending protected worker/);
  assert.match(page, /Delivered — SMTP accepted/);
  assert.match(page, /providerMessageId:\s*true/);
  assert.match(page, /Provider message ID:/);
  assert.match(bulkUi, /:not\(:disabled\)/);
  assert.match(bulkUi, /useFormStatus/);
  assert.match(bulkUi, /Processing…/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /animate-pulse/);
});

test("queued delivery results can refresh without loading the full table client-side", () => {
  assert.match(page, /EmailDeliveryLiveStatus/);
  assert.match(liveStatus, /router\.refresh\(\)/);
  assert.match(liveStatus, /20000/);
  assert.match(liveStatus, /queuedCount < 1/);
});

test("sent and skipped records remain immutable history", () => {
  assert.match(page, /log\.status === NotificationStatus\.SENT/);
  assert.match(page, /Skipped — not sent/);
  assert.match(page, /SENT and SKIPPED history stays read-only/);
  assert.match(helper, /NotificationType\.BILLING_NOTIFICATION/);
  assert.match(helper, /NotificationType\.BILL_REMINDER/);
});

test("system admin navigation exposes the email delivery management screen", () => {
  assert.match(links, /href:\s*"\/admin\/settings\/email-delivery"/);
  assert.match(links, /label:\s*"Email Delivery"/);
});
