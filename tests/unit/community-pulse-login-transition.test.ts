import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginForm = readFileSync("components/login-form.tsx", "utf8");
const transitionCss = readFileSync("components/login-verified-transition.module.css", "utf8");
const webPremiumCss = readFileSync("components/community-pulse-web-premium.module.css", "utf8");
const handoffSource = readFileSync("components/post-login-brand-orbit.tsx", "utf8");
const handoffCss = readFileSync("components/post-login-brand-orbit.module.css", "utf8");
const associationLogo = readFileSync("components/association-logo.tsx", "utf8");
const passkeyLogin = readFileSync("components/passkey-login-button.tsx", "utf8");
const tenantLogin = readFileSync("components/tenant-login-screen.tsx", "utf8");

test("successful credential login shows a visible verified state before redirect", () => {
  assert.match(loginForm, /const VERIFIED_TRANSITION_MS = 800/);
  assert.match(loginForm, /setVerified\(true\)/);
  assert.match(loginForm, /window\.location\.replace\(returnTo \|\| state\.redirectTo!/);
  assert.match(loginForm, /Access verified/);
  assert.match(loginForm, /Opening your HOAHub dashboard/);
  assert.match(loginForm, /role="status"/);
  assert.match(loginForm, /aria-live="assertive"/);
});

test("pending login clearly communicates server-side verification", () => {
  assert.match(loginForm, /Verifying access…/);
  assert.match(loginForm, /pendingSpinner/);
  assert.match(loginForm, /disabled=\{pending \|\| verified\}/);
});

test("verified transition uses tenant branding without changing authentication inputs", () => {
  assert.match(tenantLogin, /tenantName=\{tenant\.name\}/);
  assert.match(tenantLogin, /logoUrl=\{logo\}/);
  assert.match(loginForm, /loginAction/);
  assert.match(loginForm, /name="identifier"/);
  assert.match(loginForm, /name="password"/);
});

test("web login uses the same stable-logo secure orbit language as mobile", () => {
  assert.match(tenantLogin, /community-pulse-web-premium\.module\.css/);
  assert.match(tenantLogin, /webStyles\.webLogoWrap/);
  assert.match(tenantLogin, /webStyles\.webSignal/);
  assert.match(webPremiumCss, /@keyframes webSecureOrbit/);
  assert.match(webPremiumCss, /@keyframes webHaloPulse/);
  assert.match(webPremiumCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test("successful login carries a short-lived one-shot orbit into authenticated HOA branding", () => {
  assert.match(loginForm, /sessionStorage\.setItem\(LOGIN_HANDOFF_STORAGE_KEY, String\(Date\.now\(\)\)\)/);
  assert.match(passkeyLogin, /sessionStorage\.setItem\(LOGIN_HANDOFF_STORAGE_KEY, String\(Date\.now\(\)\)\)/);
  assert.match(associationLogo, /PostLoginBrandOrbit/);
  assert.match(handoffSource, /LOGIN_HANDOFF_MAX_AGE_MS = 10_000/);
  assert.match(handoffSource, /LOGIN_HANDOFF_VISIBLE_MS = 1_700/);
  assert.match(handoffSource, /AUTH_ENTRY_ROUTE/);
  assert.match(handoffSource, /sessionStorage\.removeItem\(LOGIN_HANDOFF_STORAGE_KEY\)/);
  assert.match(handoffCss, /@keyframes arrivalOrbit/);
  assert.match(handoffCss, /@keyframes arrivalHalo/);
  assert.match(handoffCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test("premium success motion remains accessibility-aware", () => {
  assert.match(transitionCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(transitionCss, /@keyframes verifiedOrbit/);
  assert.match(transitionCss, /@keyframes verifiedCheck/);
  assert.match(transitionCss, /@keyframes verifiedProgress/);
});
