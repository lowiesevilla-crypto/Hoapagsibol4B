import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HomeownerActivationStatus, HomeownerEmailVerificationStatus, HomeownerStatus } from "@prisma/client";
import {
  homeownerActivationReissueEligibility,
  homeownerDigitalActivationEligibility,
  type HomeownerDigitalActivationProfile,
} from "@/lib/services/homeowner-digital-activation";

const homeownersPage = readFileSync("app/admin/homeowners/page.tsx", "utf8");
const activationBulkJobs = readFileSync("lib/services/homeowner-activation-bulk-jobs.ts", "utf8");
const activationBulkRetryRoute = readFileSync("app/api/admin/homeowners/activation-jobs/[id]/retry/route.ts", "utf8");
const activationBulkProgress = readFileSync("components/homeowner-activation-bulk-progress.tsx", "utf8");

function homeowner(overrides: Partial<HomeownerDigitalActivationProfile> = {}): HomeownerDigitalActivationProfile {
  return {
    tenantId: "tenant-a",
    accountNumber: "12345678901",
    status: HomeownerStatus.ACTIVE,
    activationStatus: HomeownerActivationStatus.NOT_INVITED,
    emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
    activationSentAt: null,
    activatedAt: null,
    user: { active: true, email: "owner@example.com" },
    ...overrides,
  };
}

test("first-time activation eligibility accepts only never-invited active homeowners", () => {
  const result = homeownerDigitalActivationEligibility(homeowner());
  assert.equal(result.eligible, true);
  assert.match(result.reason, /first-time/i);
});

test("first-time activation eligibility rejects an already-issued invitation", () => {
  const result = homeownerDigitalActivationEligibility(homeowner({
    activationStatus: HomeownerActivationStatus.INVITATION_SENT,
    activationSentAt: new Date(),
  }));
  assert.equal(result.eligible, false);
  assert.match(result.reason, /already issued/i);
});

test("first-time activation eligibility rejects an expired prior invitation so resend remains explicit", () => {
  const result = homeownerDigitalActivationEligibility(homeowner({
    activationStatus: HomeownerActivationStatus.EXPIRED,
    activationSentAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
  }));
  assert.equal(result.eligible, false);
  assert.match(result.reason, /resend\/reissue/i);
});

test("first-time activation eligibility rejects activated and disabled homeowners", () => {
  assert.equal(homeownerDigitalActivationEligibility(homeowner({
    activationStatus: HomeownerActivationStatus.ACTIVE,
    activatedAt: new Date(),
  })).eligible, false);
  assert.equal(homeownerDigitalActivationEligibility(homeowner({
    activationStatus: HomeownerActivationStatus.DISABLED,
  })).eligible, false);
});

test("explicit activation reissue is separate from first-time eligibility", () => {
  assert.equal(homeownerActivationReissueEligibility(homeowner()).eligible, false);
  assert.equal(homeownerActivationReissueEligibility(homeowner({
    activationStatus: HomeownerActivationStatus.EXPIRED,
    activationSentAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
  })).eligible, true);
  assert.equal(homeownerActivationReissueEligibility(homeowner({
    activationStatus: HomeownerActivationStatus.CANCELLED,
    activationSentAt: new Date(),
  })).eligible, true);
  assert.equal(homeownerActivationReissueEligibility(homeowner({
    activationStatus: HomeownerActivationStatus.ACTIVE,
    activatedAt: new Date(),
  })).eligible, false);
});

test("bulk activation page shows server-side confirmation buckets before queueing", () => {
  assert.match(homeownersPage, /Current filter confirmation preview/);
  assert.match(homeownersPage, /Already invited/);
  assert.match(homeownersPage, /Missing email/);
  assert.match(homeownersPage, /Other blocked/);
  assert.match(homeownersPage, /homeownerActivationConfirmationBreakdown/);
});

test("homeowner list exposes explicit selected-only reissue separate from first-time send", () => {
  assert.match(homeownersPage, /name="reissueHomeownerId"/);
  assert.match(homeownersPage, /intent="reissue:selected"/);
  assert.match(homeownersPage, /Reissue selected invited\/expired/);
  assert.match(homeownersPage, /activated digital accounts are excluded/);
  assert.match(activationBulkJobs, /activationSendMode/);
  assert.match(activationBulkJobs, /HOMEOWNER_ACTIVATION_BULK_REISSUE_CREATED/);
  assert.doesNotMatch(activationBulkJobs, /reissue[\s\S]{0,120}HomeownerActivationBulkSelectionMode\.FILTERED/);
});

test("failed-only retry for activation bulk jobs cannot resend accepted recipients", () => {
  assert.match(activationBulkJobs, /createFailedHomeownerActivationBulkRetry/);
  assert.match(activationBulkJobs, /status: HomeownerActivationBulkItemStatus\.FAILED/);
  assert.doesNotMatch(activationBulkJobs, /status: HomeownerActivationBulkItemStatus\.ACCEPTED[\s\S]{0,240}createMany/);
  assert.match(activationBulkJobs, /retryFailedOnly: true/);
  assert.match(activationBulkRetryRoute, /HOMEOWNER_ACTIVATION_BULK_DELIVERY_ENABLED/);
  assert.match(activationBulkRetryRoute, /createFailedHomeownerActivationBulkRetry/);
  assert.match(activationBulkProgress, /Retry .* failed only/);
});
