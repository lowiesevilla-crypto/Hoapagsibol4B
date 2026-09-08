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
