import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/settings/email-delivery/page.tsx", "utf8");
const archivePage = readFileSync("app/admin/settings/email-delivery/archive/page.tsx", "utf8");
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
});

test("delete from queue accepts any queued email type while preserving tenant-safe soft-removal audit", () => {
  const removeStart = action.indexOf('if (bulkAction === "remove")');
  const resendStart = action.indexOf('} else if (bulkAction === "requeue")', removeStart);
  assert.ok(removeStart >= 0 && resendStart > removeStart);
  const removeBlock = action.slice(removeStart, resendStart);
  assert.match(removeBlock, /selectionWhere/);
  assert.match(removeBlock, /status:\s*NotificationStatus\.QUEUED/);
  assert.doesNotMatch(removeBlock, /type:\s*\{\s*in:\s*RETRYABLE_EMAIL_TYPES/);
  assert.match(removeBlock, /status:\s*NotificationStatus\.SKIPPED/);
  assert.match(removeBlock, /action:\s*"BULK_REMOVE_QUEUED_EMAILS"/);
  assert.match(removeBlock, /removalScope:\s*"ANY_QUEUED_EMAIL"/);
  assert.match(removeBlock, /hardDeleted:\s*false/);
  assert.doesNotMatch(removeBlock, /notificationLog\.deleteMany/);
});

test("archive moves only terminal SENT or SKIPPED history out of NotificationLog with per-record audit snapshots", () => {
  assert.match(action, /TERMINAL_EMAIL_STATUSES = \[NotificationStatus\.SENT, NotificationStatus\.SKIPPED\]/);
  assert.match(action, /bulkAction === "archive"/);
  assert.match(action, /take:\s*HISTORY_ARCHIVE_MAX_PER_ACTION/);
  assert.match(action, /auditLog\.createMany/);
  assert.match(action, /action:\s*EMAIL_ARCHIVE_ACTION/);
  assert.match(action, /entityType:\s*EMAIL_ARCHIVE_ENTITY/);
  assert.match(action, /originalNotificationId:/);
  assert.match(action, /maskedEmail:/);
  assert.match(action, /originalStatus:/);
  assert.match(action, /providerMessageId:/);
  assert.match(action, /notificationLog\.deleteMany/);
  assert.match(page, /Archived history \(\{archivedCount\}\)/);
  assert.match(page, /Archive history/);
});

test("permanent history deletion is terminal-status scoped and keeps only a non-content administrative audit", () => {
  assert.match(action, /bulkAction === "purge"/);
  assert.match(action, /status:\s*\{ in:\s*\[\.\.\.TERMINAL_EMAIL_STATUSES\] \}/);
  assert.match(action, /action:\s*"PERMANENT_DELETE_EMAIL_HISTORY"/);
  assert.match(action, /detailedEmailHistoryRetained:\s*false/);
  assert.match(page, /Permanent delete history/);
  assert.match(page, /confirmationPhrase="DELETE PERMANENTLY"/);
  assert.match(bulkUi, /window\.prompt/);
  assert.match(bulkUi, /Confirmation phrase did not match/);
});

test("archived history has server pagination, filters, tenant isolation, and guarded permanent cleanup", () => {
  assert.match(archivePage, /requireUser\(Role\.SYSTEM_ADMIN\)/);
  assert.match(archivePage, /tenantId:\s*user\.tenantId/);
  assert.match(archivePage, /action:\s*EMAIL_ARCHIVE_ACTION/);
  assert.match(archivePage, /entityType:\s*EMAIL_ARCHIVE_ENTITY/);
  assert.match(archivePage, /skip:\s*\(page - 1\) \* pageSize/);
  assert.match(archivePage, /take:\s*pageSize/);
  assert.match(archivePage, /Search archive/);
  assert.match(archivePage, /Permanent delete archived/);
  assert.match(archivePage, /confirmationPhrase="DELETE PERMANENTLY"/);
  assert.match(action, /export async function purgeArchivedEmailHistoryAction/);
  assert.match(action, /action:\s*"PERMANENT_DELETE_ARCHIVED_EMAIL_HISTORY"/);
  assert.match(action, /detailedArchiveRetained:\s*false/);
});

test("bulk UI exposes status-scoped actions without loading the full table client-side", () => {
  assert.match(page, /EmailDeliverySelectPage count=\{actionableOnPage\}/);
  assert.match(page, /disabled=\{!actionable\}/);
  assert.match(page, /Resend \/ Retry/);
  assert.match(page, /Delete from queue/);
  assert.match(page, /Archive history/);
  assert.match(page, /Permanent delete history/);
  assert.match(page, /Pending protected worker/);
  assert.match(page, /Delivered — archive\/delete eligible/);
  assert.match(page, /providerMessageId:\s*true/);
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

test("protected resend types remain billing and bill reminder only", () => {
  assert.match(helper, /NotificationType\.BILLING_NOTIFICATION/);
  assert.match(helper, /NotificationType\.BILL_REMINDER/);
});

test("system admin navigation exposes the email delivery management screen", () => {
  assert.match(links, /href:\s*"\/admin\/settings\/email-delivery"/);
  assert.match(links, /label:\s*"Email Delivery"/);
});
