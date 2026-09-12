import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/settings/email-delivery/page.tsx", "utf8");
const action = readFileSync("lib/actions/email-delivery-management.ts", "utf8");
const links = readFileSync("components/sidebar-links.ts", "utf8");

test("email delivery management reads only tenant-scoped email logs", () => {
  assert.match(page, /tenantId:\s*user\.tenantId/);
  assert.match(page, /channel:\s*NotificationChannel\.EMAIL/);
  assert.match(page, /take:\s*PAGE_SIZE/);
  assert.match(page, /skip:\s*\(page - 1\) \* PAGE_SIZE/);
  assert.match(page, /recipient:\s*\{\s*is:/);
  assert.match(page, /maskedEmail\(log\.recipient\.email\)/);
});

test("manual retry is concurrency-safe, tenant-scoped, and never bypasses the protected worker", () => {
  assert.match(action, /requirePermission\(Permission\.SETTINGS_MANAGE\)/);
  assert.match(action, /tenantId:\s*admin\.tenantId/);
  assert.match(action, /channel:\s*NotificationChannel\.EMAIL/);
  assert.match(action, /status:\s*NotificationStatus\.FAILED/);
  assert.match(action, /type:\s*\{\s*in:\s*\[\.\.\.RETRYABLE_EMAIL_TYPES\]\s*\}/);
  assert.match(action, /status:\s*NotificationStatus\.QUEUED/);
  assert.match(action, /retryAttempts:\s*0/);
  assert.match(action, /update\.count !== 1/);
  assert.match(action, /action:\s*"REQUEUE_FAILED_EMAIL"/);
  assert.match(action, /directSmtpSend:\s*false/);
  assert.doesNotMatch(action, /nodemailer|sendProtectedRawEmail|sendMail\(/);
});

test("sent and unsupported email records cannot be retried from the management page", () => {
  assert.match(page, /log\.status === NotificationStatus\.FAILED && RETRYABLE_TYPES\.has\(log\.type\)/);
  assert.match(page, /NotificationStatus\.SENT \? "Read only"/);
  assert.match(action, /Only failed email deliveries can be placed back into the protected queue/);
  assert.match(action, /NotificationType\.BILLING_NOTIFICATION/);
  assert.match(action, /NotificationType\.BILL_REMINDER/);
});

test("system admin navigation exposes the email delivery management screen", () => {
  assert.match(links, /href:\s*"\/admin\/settings\/email-delivery"/);
  assert.match(links, /label:\s*"Email Delivery"/);
});
