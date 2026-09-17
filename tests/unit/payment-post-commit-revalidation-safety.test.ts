import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

function section(text: string, start: string, end?: string) {
  const startIndex = text.indexOf(start);
  assert.ok(startIndex >= 0, `Missing section start: ${start}`);
  const endIndex = end ? text.indexOf(end, startIndex + start.length) : text.length;
  assert.ok(endIndex > startIndex, `Missing section end: ${end}`);
  return text.slice(startIndex, endIndex);
}

test("monthly payment commit cannot be reported as failed by cache revalidation", async () => {
  const actions = await source("lib/actions/payments.ts");
  const record = section(actions, "export async function recordPaymentAction", "export async function updatePaymentAmountAction");

  assert.match(record, /TransactionIsolationLevel\.Serializable/);
  assert.match(record, /idempotencyKey/);
  assert.match(record, /safeRevalidatePaymentPages\(\{ action: "record"/);
  assert.match(record, /redirect\(`\/receipts\/payment\/\$\{confirmation\.paymentId\}`\)/);
  assert.doesNotMatch(record, /\brevalidatePath\(/);
});

test("payment validation failures stay on the payment page instead of the global error boundary", async () => {
  const actions = await source("lib/actions/payments.ts");
  const record = section(actions, "export async function recordPaymentAction", "export async function updatePaymentAmountAction");

  assert.match(record, /if \(!parsed\.success\) redirect\(`\/admin\/payments\/record\?error=/);
  assert.match(record, /Select%20at%20least%20one%20open%20billing%20item/);
  assert.match(record, /Payment%20submission%20token%20is%20invalid/);
  assert.doesNotMatch(record, /throw new Error\(/);
});

test("all payment post-commit revalidation is best effort and observable", async () => {
  const actions = await source("lib/actions/payments.ts");
  const helper = section(actions, "function safeRevalidatePaymentPages");

  assert.match(helper, /for \(const path of paths\)/);
  assert.match(helper, /try \{\s*revalidatePath\(path\);\s*\} catch/);
  assert.match(helper, /payment_post_commit_revalidation_failed/);
  assert.match(helper, /tenantId/);
  assert.match(helper, /actorId/);
  assert.match(helper, /paymentId/);
});

test("payment update and void actions also use safe post-commit invalidation", async () => {
  const actions = await source("lib/actions/payments.ts");
  const update = section(actions, "export async function updatePaymentAmountAction", "export async function voidPaymentAction");
  const voiding = section(actions, "export async function voidPaymentAction", "function safeRevalidatePaymentPages");

  assert.match(update, /safeRevalidatePaymentPages\(\{ action: "update_amount"/);
  assert.doesNotMatch(update, /\brevalidatePath\(/);
  assert.match(voiding, /safeRevalidatePaymentPages\(\{ action: "void"/);
  assert.doesNotMatch(voiding, /\brevalidatePath\(/);
});

test("the production Record Payment actions use guarded post-commit revalidation", async () => {
  const actions = await source("lib/actions/advance-payments.ts");
  const submission = section(actions, "async function recordHomeownerPaymentSubmission", "function safeRevalidateHomeownerPaymentPages");
  const helper = section(actions, "function safeRevalidateHomeownerPaymentPages", "async function requirePaymentProgressAdmin");
  const form = await source("components/record-payment-advance-form.tsx");

  assert.match(form, /recordHomeownerPaymentAction/);
  assert.match(form, /recordHomeownerPaymentProgressAction/);
  assert.match(submission, /TransactionIsolationLevel\.Serializable/);
  assert.match(submission, /idempotencyKey/);
  assert.match(submission, /safeRevalidateHomeownerPaymentPages\(/);
  assert.doesNotMatch(submission, /\brevalidatePath\(/);
  assert.match(helper, /try \{\s*revalidatePath\(path\);\s*\} catch/);
  assert.match(helper, /payment_post_commit_revalidation_failed/);
  assert.match(helper, /tenantId/);
  assert.match(helper, /actorId/);
  assert.match(helper, /paymentId/);
  assert.match(helper, /homeownerId/);
});
