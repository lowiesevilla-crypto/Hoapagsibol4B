import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  classifyMailFailure,
  maskEmailAddress,
  validateEmailRecipient,
} from "../../lib/services/email-delivery-safety";

const notifications = readFileSync("lib/services/notifications.ts", "utf8");
const platformInvoiceEmail = readFileSync("lib/services/platform-invoice-email.ts", "utf8");
const workerRoute = readFileSync("app/api/cron/email-delivery/route.ts", "utf8");
const scheduler = readFileSync(".github/workflows/email-delivery-scheduler.yml", "utf8");

test("recipient validation accepts normal mailboxes and normalizes case", () => {
  const result = validateEmailRecipient("  Owner.Name+hoa@GMAIL.com ");
  assert.equal(result.valid, true);
  assert.equal(result.code, "VALID");
  assert.equal(result.normalizedEmail, "owner.name+hoa@gmail.com");
  assert.equal(result.fingerprint.length, 64);
});

test("internal no-email homeowner placeholders are blocked before SMTP", () => {
  const result = validateEmailRecipient("no-email+12345678901@no-email.hoahub.invalid");
  assert.equal(result.valid, false);
  assert.equal(result.code, "INTERNAL_PLACEHOLDER");
});

test("malformed and reserved non-deliverable recipient domains fail closed", () => {
  assert.equal(validateEmailRecipient("broken@@gmail.com").valid, false);
  assert.equal(validateEmailRecipient("owner @gmail.com").valid, false);
  assert.equal(validateEmailRecipient("owner@localhost").valid, false);
  assert.equal(validateEmailRecipient("owner@hoa.invalid").code, "NON_DELIVERABLE_DOMAIN");
  assert.equal(validateEmailRecipient("owner@hoa.test").code, "NON_DELIVERABLE_DOMAIN");
});

test("masked email does not retain the complete recipient address", () => {
  const masked = maskEmailAddress("long.homeowner@example.org");
  assert.notEqual(masked, "long.homeowner@example.org");
  assert.match(masked, /\*\*\*/);
});

test("provider suspension authentication and rate-limit failures open the provider circuit", () => {
  assert.equal(classifyMailFailure(Object.assign(new Error("Invalid login"), { code: "EAUTH", responseCode: 535 })).kind, "PROVIDER_CIRCUIT");
  assert.equal(classifyMailFailure(Object.assign(new Error("Mailbox temporarily suspended due to sending activity"), { responseCode: 550 })).kind, "PROVIDER_CIRCUIT");
  assert.equal(classifyMailFailure(Object.assign(new Error("Too many messages; rate limit exceeded"), { responseCode: 451 })).kind, "PROVIDER_CIRCUIT");
});

test("hard recipient rejection is permanent while transient SMTP errors remain retryable", () => {
  assert.equal(classifyMailFailure(Object.assign(new Error("550 5.1.1 User unknown"), { responseCode: 550 })).kind, "PERMANENT_RECIPIENT");
  assert.equal(classifyMailFailure(Object.assign(new Error("421 Service temporarily unavailable"), { responseCode: 421 })).kind, "TEMPORARY");
  assert.equal(classifyMailFailure(Object.assign(new Error("socket timeout"), { code: "ETIMEDOUT" })).kind, "TEMPORARY");
});

test("bulk billing and reminder notifications are queued instead of performing SMTP fan-out", () => {
  assert.match(notifications, /NotificationType\.BILLING_NOTIFICATION/);
  assert.match(notifications, /NotificationType\.BILL_REMINDER/);
  assert.match(notifications, /if \(QUEUED_NOTIFICATION_TYPES\.has\(input\.type\)\) return queued/);
  assert.match(notifications, /EMAIL_BULK_DELIVERY_ENABLED === "true"/);
  assert.match(notifications, /runSerializedSmtp/);
  assert.match(notifications, /MAX_BULK_RETRY_ATTEMPTS = 3/);
});

test("platform invoice email cannot bypass the protected SMTP gateway", () => {
  assert.doesNotMatch(platformInvoiceEmail, /from "nodemailer"/);
  assert.match(platformInvoiceEmail, /sendProtectedRawEmail/);
  assert.match(platformInvoiceEmail, /maskEmailAddress/);
});

test("protected queue endpoint and scheduler are tenant-bounded and fail closed by default", () => {
  assert.match(workerRoute, /processQueuedEmailNotifications\(tenant\.id/);
  assert.match(workerRoute, /runWithTenant/);
  assert.match(workerRoute, /EMAIL_BULK_DELIVERY_ENABLED === "true"/);
  assert.match(scheduler, /api\/cron\/email-delivery/);
  assert.match(scheduler, /cancel-in-progress: false/);
});
