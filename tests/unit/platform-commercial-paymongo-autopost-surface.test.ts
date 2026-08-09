import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { safeReturnTo } from "../../lib/auth-return-to";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("platform subscription catalog exposes audited plan editing including the one-time fee", () => {
  const catalog = source("app/platform/plans/page.tsx");
  const editPage = source("app/platform/plans/[id]/page.tsx");
  const action = source("lib/actions/platform-plan-edit.ts");
  assert.match(catalog, /Edit plan/);
  assert.match(catalog, /One-time fee/);
  assert.match(editPage, /One-time setup fee/);
  assert.match(editPage, /updateSubscriptionPlanAction/);
  assert.match(action, /Role\.SUPER_ADMIN/);
  assert.match(action, /Role\.PLATFORM_ADMIN/);
  assert.match(action, /PLAN_UPDATED/);
  assert.match(action, /setupFee/);
  assert.match(action, /subscriptionPlanModule\.deleteMany/);
  assert.match(action, /historicalAgreementTermsUnaffected: true/);
});

test("new agreements snapshot one-time setup fees without mutating delivered or executed records", () => {
  const commercialTerms = source("lib/services/platform-agreement-commercial-terms.ts");
  const agreementActions = source("lib/actions/platform-agreements.ts");
  assert.match(commercialTerms, /COMMERCIAL ORDER — ONE-TIME FEE/);
  assert.match(commercialTerms, /subscription\.plan\.setupFee/);
  assert.match(commercialTerms, /oneTimeSetupFee:/);
  assert.match(commercialTerms, /TenantAgreementStatus\.DRAFT/);
  assert.match(commercialTerms, /TenantAgreementStatus\.READY_FOR_SIGNATURE/);
  assert.match(commercialTerms, /already delivered or executed/);
  assert.match(commercialTerms, /AGREEMENT_ONE_TIME_FEE_SNAPSHOTTED/);
  assert.match(agreementActions, /ensureAgreementOneTimeFeeSnapshot\(\{ agreementId: agreement\.id/);
  assert.match(agreementActions, /ensureAgreementOneTimeFeeSnapshot\(\{ agreementId, actorId: actor\.id \}\)/);
});

test("platform can cancel agreements while preserving signed evidence and audit history", () => {
  const action = source("lib/actions/platform-agreement-cancel.ts");
  const page = source("app/platform/agreements/[id]/page.tsx");
  assert.match(page, /Cancel \/ terminate agreement/);
  assert.match(page, /cancelPlatformAgreementAction/);
  assert.match(action, /status: TenantAgreementStatus\.TERMINATED/);
  assert.match(action, /terminatedAt: now/);
  assert.match(action, /terminationReason: reason/);
  assert.match(action, /AgreementAuditEventType\.TERMINATED/);
  assert.match(action, /AGREEMENT_CANCELLED_BY_PLATFORM/);
  assert.match(action, /signedAgreementRecordPreserved/);
  assert.doesNotMatch(action, /tenantSubscriptionAgreement\.delete/);
});

test("PayMongo Online uses gateway verification and canonical auto-posting instead of manual approval", () => {
  const reconcile = source("lib/services/homeowner-paymongo-reconciliation.ts");
  const confirmRoute = source("app/portal/pay/paymongo-confirm/route.ts");
  const resumeRoute = source("app/portal/pay/paymongo-resume/route.ts");
  const adminPage = source("app/admin/payments/requests/[id]/page.tsx");
  const adminReconcile = source("lib/actions/homeowner-paymongo-reconciliation.ts");

  assert.match(reconcile, /https:\/\/api\.paymongo\.com\/v1\/checkout_sessions/);
  assert.match(reconcile, /"Account-ID": accountId/);
  assert.match(reconcile, /status \|\| ""\)\.toLowerCase\(\) === "paid"/);
  assert.match(reconcile, /reference_number/);
  assert.match(reconcile, /metadata\.tenantId/);
  assert.match(reconcile, /metadata\.homeownerId/);
  assert.match(reconcile, /validatePaidCheckoutAmounts/);
  assert.match(reconcile, /allowGatewayConfirmation: true/);
  assert.match(reconcile, /PAYMONGO_HOMEOWNER_PAYMENT_RECONCILED/);
  assert.match(confirmRoute, /reconcilePendingHomeownerPayMongoPayments/);
  assert.match(confirmRoute, /online", "awaiting"/);
  assert.doesNotMatch(confirmRoute, /online", "confirming"/);
  assert.match(resumeRoute, /reconcileHomeownerPayMongoCheckout/);

  assert.match(adminPage, /No manual approval required/);
  assert.match(adminPage, /Refresh PayMongo status/);
  assert.match(adminPage, /isPaymongoCheckoutSessionRemark/);
  assert.match(adminPage, /online \? <div/);
  assert.match(adminPage, /request\.status === "PENDING_REVIEW" && online/);
  assert.match(adminPage, /request\.status === "PENDING_REVIEW" \? <div/);
  assert.match(adminReconcile, /reconcileHomeownerPayMongoCheckout/);
  assert.doesNotMatch(adminReconcile, /approvePaymentRequestAction/);
});

test("manual QR review workflow remains unchanged and still exposes approval and rejection", () => {
  const page = source("app/admin/payments/requests/[id]/page.tsx");
  const manualActions = source("lib/actions/payment-requests.ts");
  assert.match(page, /approvePaymentRequestAction/);
  assert.match(page, /rejectPaymentRequestAction/);
  assert.match(page, /Approve as paid/);
  assert.match(page, /Reject request/);
  assert.match(manualActions, /paymentConfig\.flow !== "MANUAL_QR"/);
});

test("protected email deep links survive authentication without allowing external return redirects", () => {
  const middleware = source("middleware.ts");
  const loginPage = source("app/login/page.tsx");
  const loginForm = source("components/login-form.tsx");
  const passkey = source("components/passkey-login-button.tsx");
  assert.equal(safeReturnTo("/admin/agreement/abc?source=email"), "/admin/agreement/abc?source=email");
  assert.equal(safeReturnTo("/portal/pay?online=confirming"), "/portal/pay?online=confirming");
  assert.equal(safeReturnTo("https://evil.example/phish"), "");
  assert.equal(safeReturnTo("//evil.example/phish"), "");
  assert.equal(safeReturnTo("/login?returnTo=/portal/pay"), "");
  assert.match(middleware, /loginUrl\.searchParams\.set\("returnTo", returnTo\)/);
  assert.match(middleware, /online"\) === "confirming"/);
  assert.match(loginPage, /safeReturnTo\(query\.returnTo\)/);
  assert.match(loginForm, /window\.location\.replace\(returnTo \|\| state\.redirectTo\)/);
  assert.match(passkey, /safeReturnTo\(String\(data\.get\("returnTo"\)/);
  assert.match(passkey, /window\.location\.replace\(returnTo \|\| result\.redirectTo/);
});

test("homeowner PayMongo webhook endpoint is explicitly exempted from browser origin mutation checks", () => {
  const middleware = source("middleware.ts");
  assert.match(middleware, /\/api\/homeowner-payments\/webhooks\/paymongo/);
});
