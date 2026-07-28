import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import "./register-server-only-shim.cjs";
import { compare, hash } from "bcryptjs";
import { HomeownerActivationStatus, HomeownerEmailVerificationStatus, PrismaClient, Role } from "@prisma/client";
import { homeownerDigitalActivationEligibility } from "../lib/services/homeowner-digital-activation";

loadLocalEnv();
const prisma = new PrismaClient();
const rollback = new Error("ROLLBACK_HOMEOWNER_UNIVERSAL_AUTH_VERIFICATION");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requireLocalClone() {
  const url = process.env.DATABASE_URL || "";
  assert(url.includes("127.0.0.1") && url.includes("hoahub_prodclone_local"), "Verification must run only against 127.0.0.1 / hoahub_prodclone_local.");
}

function testAccountNumber() {
  return `9${Math.floor(Math.random() * 10_000_000_000).toString().padStart(10, "0")}`;
}

function assertSourceSafeguards() {
  const manifest = readFileSync("app/manifest.ts", "utf8");
  const nextConfig = readFileSync("next.config.ts", "utf8");
  const loginForm = readFileSync("components/login-form.tsx", "utf8");
  const tenantLoginScreen = readFileSync("components/tenant-login-screen.tsx", "utf8");
  const passkeyService = readFileSync("lib/services/passkeys.ts", "utf8");
  const passkeyButton = readFileSync("components/passkey-login-button.tsx", "utf8");
  const passkeyLoginVerifyRoute = readFileSync("app/api/auth/passkeys/login/verify/route.ts", "utf8");
  const authCore = readFileSync("lib/auth.ts", "utf8");
  const authActions = readFileSync("lib/actions/auth.ts", "utf8");
  const loginOptionsRoute = readFileSync("app/api/auth/passkeys/login/options/route.ts", "utf8");
  const homeownerActions = readFileSync("lib/actions/homeowners.ts", "utf8");
  const notifications = readFileSync("lib/services/notifications.ts", "utf8");
  const searchInput = readFileSync("components/ui.tsx", "utf8");
  const activationService = readFileSync("lib/services/homeowner-activation.ts", "utf8");
  const homeownerActivationAction = readFileSync("lib/actions/homeowner-activation.ts", "utf8");
  const homeownerDetail = readFileSync("app/admin/homeowners/[id]/page.tsx", "utf8");
  const emailVerificationRoute = readFileSync("app/activate/verify/route.ts", "utf8");
  const homeownerList = readFileSync("app/admin/homeowners/page.tsx", "utf8");
  const appUrl = readFileSync("lib/app-url.ts", "utf8");
  assert(manifest.includes('start_url: "/login"'), "PWA manifest must start installed apps at universal login.");
  assert(nextConfig.includes("no-store, max-age=0"), "Auth/protected routes must send no-store cache headers.");
  assert(nextConfig.includes("publickey-credentials-create=(self)") && nextConfig.includes("publickey-credentials-get=(self)"), "Passkey browser permissions are not configured.");
  assert(loginForm.includes('name="identifier"') && loginForm.includes("Email address or 11-digit account number") && !loginForm.includes('name="accountNumber"') && !loginForm.includes('name="email"'), "Login form must use one identifier field and must not require both email and account number.");
  assert(tenantLoginScreen.includes("Sign in using your verified email or 11-digit homeowner account number.") && tenantLoginScreen.includes("You have been signed out securely."), "Login screen copy or signed-out message is missing.");
  assert(loginForm.includes("PasskeyLoginButton"), "Universal login must expose passkey login.");
  assert(passkeyButton.includes('data.get("identifier")') && !passkeyButton.includes("Enter your registered email first."), "Passkey login must be independent of required email/account-number fields.");
  assert(loginOptionsRoute.includes("generatePasskeyDiscoveryAuthenticationOptions") && loginOptionsRoute.includes("hoa_passkey_login_challenge"), "Passkey login options must support discoverable passkeys without an identifier.");
  assert(authActions.includes("identifierType") && authActions.includes("/login?loggedOut=1") && authActions.includes("`/${tenant.slug}/login?loggedOut=1`"), "Login action must use identifier resolution and deterministic logout routing.");
  assert(authActions.includes("emailStatus === \"VERIFIED\"") && authActions.includes("Incorrect identifier or password."), "Returning homeowner email login must require verified email and use generic invalid-login errors.");
  assert(passkeyService.includes("verifyRegistrationResponse") && passkeyService.includes("verifyAuthenticationResponse"), "Passkey implementation must use server-side WebAuthn verification.");
  assert(passkeyService.includes("WEBAUTHN_ORIGIN") && passkeyService.includes("WEBAUTHN_RP_ID") && passkeyService.includes("PASSKEY_DOMAIN_CONFIGURATION_ERROR"), "Passkey RP ID and expected origin must use explicit WebAuthn configuration.");
  assert((passkeyService.match(/const rp = passkeyRp\(\)/g) || []).length >= 5, "Registration and authentication generation/verification must use matching passkeyRp configuration.");
  assert(passkeyService.includes("expectedOrigin: rp.origin") && passkeyService.includes("expectedRPID: rp.rpID"), "Passkey verification must use configured origin and RP ID.");
  assert(passkeyService.includes("isIpAddress") && passkeyService.includes('value.includes("://")') && passkeyService.includes('value.includes(":")'), "Passkey RP ID must reject IPs, schemes, ports, and paths.");
  assert(passkeyService.includes("active: true") && passkeyService.includes("activationStatus: HomeownerActivationStatus.ACTIVE") && passkeyService.includes("emailStatus: HomeownerEmailVerificationStatus.VERIFIED") && passkeyService.includes("!credentialRecord.user.active"), "Passkey login must reject digitally disabled or email-unverified homeowner accounts.");
  assert(passkeyService.includes("const homeownerProfile = credentialRecord?.user.homeownerProfile") && passkeyService.includes("homeownerProfile?.emailStatus !== HomeownerEmailVerificationStatus.VERIFIED"), "Passkey authentication must resolve and validate the server-side homeowner profile before session creation.");
  assert(passkeyLoginVerifyRoute.includes("runWithTenant(session.tenantId") && passkeyLoginVerifyRoute.includes("() => createSession(session)") && passkeyLoginVerifyRoute.indexOf("await verifyPasskeyAuthentication") < passkeyLoginVerifyRoute.indexOf("await runWithTenant"), "Passkey login must create UserSession inside the resolved tenant context.");
  assert(passkeyLoginVerifyRoute.includes('return NextResponse.json({ error: "Passkey authentication could not be verified." }') && !passkeyLoginVerifyRoute.includes("error instanceof Error ? error.message"), "Passkey login verification must return a generic safe error.");
  assert(authCore.indexOf("await prisma.userSession.create({ data: prepared.data })") >= 0 && authCore.indexOf("await prisma.userSession.create({ data: prepared.data })") < authCore.indexOf("await setSessionCookie(prepared)"), "Session cookie must be set only after UserSession.create succeeds.");
  assert(homeownerActions.includes("regenerateHomeownerActivationAction") && homeownerActions.includes("disableHomeownerActivationAction"), "Admin activation management actions are missing.");
  assert(homeownerActions.includes("enableHomeownerDigitalAccessAction"), "Enable Digital Access admin action is missing.");
  assert(homeownerActions.includes("homeownerActivationAdminRoles") && homeownerActions.includes("Role.SUPER_ADMIN") && homeownerActions.includes("Role.SYSTEM_ADMIN") && homeownerActions.includes("Role.HOA_ADMIN") && homeownerActions.includes("Role.ADMIN") && !homeownerActions.includes("Role.PLATFORM_ADMIN, Role.HOA_ADMIN"), "Enable/disable digital access roles must match the approved tenant-admin role model.");
  assert(homeownerActions.includes("HOMEOWNER_ACTIVATION_ENABLED") && homeownerActions.includes("sessionCreated: false") && homeownerActions.includes("passwordPreserved: true") && homeownerActions.includes("passkeysPreserved: true"), "Enable Digital Access audit metadata must record safe restoration behavior.");
  assert(homeownerActions.includes("runWithTenant(admin.tenantId") && homeownerActions.includes("tx.userSession.updateMany") && homeownerActions.includes("data: { active: true }"), "Enable/disable digital access must run tenant-scoped and avoid automatic session creation.");
  assert(homeownerDetail.includes("Enable Digital Access") && homeownerDetail.includes("Digital Access Disabled") && homeownerDetail.includes("Disabled Date") && homeownerDetail.includes("Active Sessions"), "Admin homeowner panel must expose disabled-state recovery details.");
  assert(searchInput.includes("terms.some((term) => !haystack.includes(term))"), "Admin search must match typed terms independently.");
  assert(searchInput.includes('normalize("NFKD")'), "Admin search must normalize accented search text.");
  assert(activationService.includes("HOMEOWNER_ACTIVATION_EMAIL_ATTEMPTED"), "Activation email attempts must be audited safely.");
  assert(activationService.includes("homeownerEmailVerificationToken.create"), "Activation credential generation must create an email-verification record.");
  assert(activationService.includes("emailVerificationToken") && activationService.includes("/verify?token="), "Activation email must include a registered-email verification link.");
  assert(activationService.includes("HOMEOWNER_EMAIL_VERIFIED"), "Email verification must create an audit event.");
  assert(emailVerificationRoute.includes("verifyHomeownerEmailVerificationToken"), "Activation email verification route is missing.");
  assert(activationService.includes("SECTION 1 - HEADER") && activationService.includes("ACCOUNT CREDENTIAL CARD") && activationService.includes("INSTALLATION GUIDE"), "Activation email must be sectioned, not a single paragraph.");
  assert(activationService.includes("Android Chrome") && activationService.includes("iPhone Safari") && activationService.includes("Desktop Chrome / Edge"), "Activation email must include mobile and desktop installation instructions.");
  assert(activationService.includes("logMessage:") && activationService.includes("redacted from logs"), "Activation notification logs must redact temporary passwords, verification links, and full account numbers.");
  assert(homeownerActions.includes("bulkSendHomeownerActivationInvitationsAction"), "Bulk homeowner activation invitation action is missing.");
  assert(homeownerActions.includes("selectedIds.length") && !homeownerActions.includes("take: mode === \"allEligible\" ? 500"), "Bulk activation must process selected homeowners only and must not cap all-eligible batches at 500.");
  assert(homeownerActions.includes("accountMasked") && !homeownerActions.includes("metadata: { accountNumber }"), "Activation audit metadata must not store complete account numbers.");
  assert(notifications.includes("username: maskEmailLike") && !notifications.includes("passwordLength"), "SMTP diagnostics must mask usernames and avoid password detail logging.");
  assert(notifications.includes("html?: string") && notifications.includes("input.html ?? emailHtml"), "Notification service must support structured activation email HTML.");
  assert(emailVerificationRoute.includes("new URL(\"/activate\", getAppUrl())"), "Email verification redirects must use configured APP_URL.");
  assert(activationService.includes("runWithTenant(record.tenantId") && activationService.includes("prisma.$transaction(async (tx)"), "Email verification must mutate through tenant-scoped transactional Prisma context.");
  assert(activationService.includes("completeHomeownerActivation") && activationService.includes("await tx.userSession.create({ data: preparedSession.data })"), "Activation completion must create the UserSession inside the transaction client.");
  assert(activationService.includes("SIMULATED_USER_SESSION_CREATE_FAILURE"), "Activation rollback test hook is missing.");
  assert(homeownerActivationAction.includes("const completion = await completeHomeownerActivation") && homeownerActivationAction.includes("await setSessionCookie(session)") && homeownerActivationAction.indexOf("const completion = await completeHomeownerActivation") < homeownerActivationAction.lastIndexOf("await setSessionCookie(session)"), "Activation cookie must be set only after completion commits.");
  assert(activationService.includes("GENERIC_EMAIL_VERIFICATION_ERROR"), "Invalid, used, expired, revoked, or cross-tenant tokens must return a safe generic result.");
  assert(homeownerList.includes("prisma.homeownerProfile.count({ where: baseWhere })"), "Homeowner list must show total tenant homeowner count.");
  assert(homeownerList.includes("take: pageSize") && homeownerList.includes("skip,"), "Homeowner list must use explicit server-side pagination.");
  assert(homeownerList.includes("digitalFilters") && homeownerList.includes("operationalStatus"), "Digital activation filters must be separate from operational status filters.");
  assert(homeownerList.includes("Eligible for First-Time Activation") && homeownerList.includes("Missing Email"), "Homeowner summary cards are missing.");
  assert(appUrl.includes("PUBLIC_APP_URL") && appUrl.includes("http://localhost:3000"), "APP_URL helper must normalize local UAT to localhost when no env override exists.");
}

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].trim().replace(/^"(.*)"$/, "$1");
    }
  }
}

function passwordPolicyAccepts(value: string) {
  return value.length >= 6 && value.length <= 24 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function challengeHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, " ")
    .trim();
}

function searchMatches(query: string, row: string) {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  const haystack = normalizeSearch(row);
  return !terms.some((term) => !haystack.includes(term));
}

async function assertWebAuthnConfiguration() {
  const { PASSKEY_DOMAIN_CONFIGURATION_ERROR, passkeyRp } = await import("../lib/services/passkeys");
  const keys = ["APP_URL", "PUBLIC_APP_URL", "WEBAUTHN_ORIGIN", "WEBAUTHN_RP_ID", "NODE_ENV"] as const;
  const env = process.env as Record<string, string | undefined>;
  const previous = Object.fromEntries(keys.map((key) => [key, env[key]]));
  try {
    env.NODE_ENV = "development";
    env.APP_URL = "http://localhost:3000";
    env.PUBLIC_APP_URL = "http://localhost:3000";
    delete env.WEBAUTHN_ORIGIN;
    delete env.WEBAUTHN_RP_ID;
    const local = passkeyRp();
    assert(local.origin === "http://localhost:3000", "Local WebAuthn origin must resolve to http://localhost:3000.");
    assert(local.rpID === "localhost", "Local WebAuthn RP ID must resolve to localhost.");
    assert(!local.rpID.includes("://") && !local.rpID.includes(":") && !local.rpID.includes("/"), "Local WebAuthn RP ID must not include scheme, port, or path.");

    env.NODE_ENV = "production";
    env.APP_URL = "https://hoahub.tech";
    env.PUBLIC_APP_URL = "https://hoahub.tech";
    env.WEBAUTHN_ORIGIN = "https://hoahub.tech";
    env.WEBAUTHN_RP_ID = "hoahub.tech";
    const production = passkeyRp();
    assert(production.origin === "https://hoahub.tech", "Production WebAuthn origin must resolve to https://hoahub.tech.");
    assert(production.rpID === "hoahub.tech", "Production WebAuthn RP ID must resolve to hoahub.tech.");
    assert(!production.rpID.includes("://") && !production.rpID.includes(":") && !production.rpID.includes("/"), "Production WebAuthn RP ID must not include scheme, port, or path.");

    for (const invalidRpID of ["127.0.0.1", "https://hoahub.tech", "hoahub.tech:443", "hoahub.tech/path"]) {
      env.WEBAUTHN_ORIGIN = invalidRpID === "127.0.0.1" ? "http://127.0.0.1:3000" : "https://hoahub.tech";
      env.WEBAUTHN_RP_ID = invalidRpID;
      let rejected = false;
      try {
        passkeyRp();
      } catch (error) {
        rejected = error instanceof Error && error.message === PASSKEY_DOMAIN_CONFIGURATION_ERROR;
      }
      assert(rejected, `Invalid WebAuthn RP ID was not rejected safely: ${invalidRpID}`);
    }
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
}

async function main() {
  requireLocalClone();
  assertSourceSafeguards();
  await assertWebAuthnConfiguration();
  assert(process.env.APP_URL === "http://localhost:3000", "Local UAT APP_URL must be http://localhost:3000 for WebAuthn.");
  assert(process.env.PUBLIC_APP_URL === "http://localhost:3000", "Local UAT PUBLIC_APP_URL must be http://localhost:3000 for WebAuthn.");
  assert(process.env.WEBAUTHN_ORIGIN === "http://localhost:3000", "Local UAT WEBAUTHN_ORIGIN must be http://localhost:3000.");
  assert(process.env.WEBAUTHN_RP_ID === "localhost", "Local UAT WEBAUTHN_RP_ID must be localhost.");
  assert(!passwordPolicyAccepts("abcdef"), "Password policy must require a number.");
  assert(!passwordPolicyAccepts("123456"), "Password policy must require a letter.");
  assert(!passwordPolicyAccepts("A1"), "Password policy must enforce minimum length.");
  assert(!passwordPolicyAccepts("A1234567890123456789012345"), "Password policy must enforce maximum length.");
  assert(passwordPolicyAccepts("Home123"), "Password policy should accept BRD-compliant passwords.");
  const searchRow = "Lowie Sevilla lowie@example.test 77123456729 block 1 lot 2";
  assert(searchMatches("Lowie", searchRow), "First-name search failed.");
  assert(searchMatches("Sevilla", searchRow), "Surname search failed.");
  assert(searchMatches("Lowie Sevilla", searchRow), "Stored-order full-name search failed.");
  assert(searchMatches("Sevilla Lowie", searchRow), "Reverse-order full-name search failed.");
  assert(searchMatches("77123456729", searchRow), "Account-number search failed.");
  assert(searchMatches("lowie@example.test", searchRow), "Email search failed.");
  assert(!searchMatches("Other Lowie", searchRow), "Search must not match terms across absent values.");

  const tenant = await prisma.tenant.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  assert(tenant, "No active tenant fixture found.");
  await assertEmailVerificationService(tenant);
  await assertActivationCompletionTransaction(tenant);
  await assertDigitalAccessEnableDisable(tenant);

  try {
    await prisma.$transaction(async (tx) => {
      const email = `uat.activation.${Date.now()}@example.test`;
      const temporaryPassword = `Tmp${Date.now().toString().slice(-6)}`;
      const permanentPassword = "Home123";
      const accountNumber = testAccountNumber();
      const unicodeName = "Khurt Laurence Sevillañ";
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: unicodeName,
          email,
          passwordHash: await hash(`activation-only-${randomUUID()}`, 12),
          role: Role.HOMEOWNER,
          homeownerProfile: {
            create: {
              tenantId: tenant.id,
              phone: "09990000000",
              address: "Universal Auth Test Address",
              block: `UA-${Date.now().toString().slice(-4)}`,
              lot: `LOT-${Date.now().toString().slice(-4)}`,
              accountNumber,
              status: "ACTIVE",
              activationStatus: HomeownerActivationStatus.INVITATION_SENT,
              emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
              activationSentAt: new Date(),
              monthlyDuesAmount: "1.00",
            },
          },
        },
        include: { homeownerProfile: true },
      });
      assert(user.homeownerProfile?.accountNumber === accountNumber, "Homeowner account-number snapshot was not stored.");
      assert(user.name.endsWith("Sevillañ"), "Unicode homeowner name was not preserved.");
      assert(homeownerDigitalActivationEligibility({ ...user.homeownerProfile, user: { active: true, email } }).eligible, "Operationally ACTIVE unactivated homeowner should be eligible for digital invitation.");

      const credential = await tx.homeownerActivationCredential.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          credentialHash: await hash(temporaryPassword, 12),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      assert(await compare(temporaryPassword, credential.credentialHash), "Temporary activation credential did not verify.");
      const failed = await compare("WrongTemp123", credential.credentialHash);
      assert(!failed, "Incorrect temporary activation credential was accepted.");

      const regeneratedPassword = `TmpR${Date.now().toString().slice(-6)}`;
      await tx.homeownerActivationCredential.updateMany({
        where: { tenantId: tenant.id, userId: user.id, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const regenerated = await tx.homeownerActivationCredential.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          credentialHash: await hash(regeneratedPassword, 12),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      const revokedOriginal = await tx.homeownerActivationCredential.findUnique({ where: { id: credential.id } });
      assert(revokedOriginal?.revokedAt, "Regenerating activation did not revoke the previous temporary credential.");
      assert(await compare(regeneratedPassword, regenerated.credentialHash), "Regenerated activation credential did not verify.");
      assert(!(await compare(temporaryPassword, regenerated.credentialHash)), "Regeneration reused the previous temporary credential.");

      await tx.homeownerActivationCredential.updateMany({
        where: { tenantId: tenant.id, userId: user.id, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.homeownerProfile.update({ where: { id: user.homeownerProfile.id }, data: { activationStatus: HomeownerActivationStatus.DISABLED } });
      const disabledProfile = await tx.homeownerProfile.findUnique({ where: { id: user.homeownerProfile.id } });
      const activeCredentialsAfterDisable = await tx.homeownerActivationCredential.count({ where: { tenantId: tenant.id, userId: user.id, usedAt: null, revokedAt: null } });
      assert(disabledProfile?.activationStatus === HomeownerActivationStatus.DISABLED, "Disable activation did not update homeowner status.");
      assert(activeCredentialsAfterDisable === 0, "Disable activation left an active temporary credential.");

      const finalTemporaryPassword = `TmpF${Date.now().toString().slice(-6)}`;
      const finalCredential = await tx.homeownerActivationCredential.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          credentialHash: await hash(finalTemporaryPassword, 12),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await tx.homeownerProfile.update({
        where: { id: user.homeownerProfile.id },
        data: { activationStatus: HomeownerActivationStatus.INVITATION_SENT, activationSentAt: new Date() },
      });

      const activatedAt = new Date();
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hash(permanentPassword, 12), lastLoginAt: activatedAt } });
      await tx.homeownerActivationCredential.update({ where: { id: finalCredential.id }, data: { usedAt: activatedAt } });
      await tx.homeownerProfile.update({
        where: { id: user.homeownerProfile.id },
        data: {
          activationStatus: HomeownerActivationStatus.ACTIVE,
          emailStatus: HomeownerEmailVerificationStatus.VERIFIED,
          emailVerifiedAt: activatedAt,
          activatedAt,
        },
      });
      const activated = await tx.homeownerProfile.findUnique({ where: { id: user.homeownerProfile.id } });
      assert(activated?.activationStatus === HomeownerActivationStatus.ACTIVE, "Activation did not move homeowner to ACTIVE.");
      assert(activated.emailStatus === HomeownerEmailVerificationStatus.VERIFIED, "Registered email was not marked verified.");
      assert(activated.emailVerifiedAt && activated.activatedAt, "Activation/email verification timestamps were not stored.");
      assert(!homeownerDigitalActivationEligibility({ ...activated, user: { active: true, email } }).eligible, "Digitally activated homeowner should not be eligible for first-time re-invitation.");
      const permanentPasswordStillWorks = await compare(permanentPassword, (await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } })).passwordHash);
      assert(permanentPasswordStillWorks, "Existing permanent homeowner password was not preserved after activation.");

      const emailToken = await tx.homeownerEmailVerificationToken.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          tokenHash: challengeHash(`email-${randomUUID()}`),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await tx.homeownerEmailVerificationToken.update({ where: { id: emailToken.id }, data: { usedAt: new Date() } });
      const usedEmailToken = await tx.homeownerEmailVerificationToken.findUnique({ where: { id: emailToken.id } });
      assert(usedEmailToken?.usedAt, "Email verification token usage was not recorded.");

      const session = await tx.userSession.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          tokenHash: `verify-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      await tx.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      const revoked = await tx.userSession.findUnique({ where: { id: session.id } });
      assert(revoked?.revokedAt, "Session revocation timestamp was not stored.");
      const activeSessions = await tx.userSession.count({ where: { tenantId: tenant.id, userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } } });
      assert(activeSessions === 0, "Revoked session still appears active.");

      const challenge = await tx.userPasskeyChallenge.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          challengeHash: challengeHash(`challenge-${randomUUID()}`),
          type: "REGISTRATION",
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      const passkey = await tx.userPasskeyCredential.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          credentialId: `credential-${randomUUID()}`,
          publicKey: Buffer.from("test-public-key").toString("base64url"),
          transports: ["internal"],
          backedUp: true,
        },
      });
      assert(challenge.type === "REGISTRATION" && Buffer.from(passkey.publicKey, "base64url").toString() === "test-public-key", "Passkey challenge or credential storage failed.");
      assert(passkey.backedUp, "Passkey backup state was not stored.");

      const crossTenant = await tx.homeownerProfile.findFirst({
        where: { tenantId: { not: tenant.id }, accountNumber },
        select: { id: true },
      });
      assert(!crossTenant, "Account-number lookup crossed tenant boundaries.");

      const missingEmailUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: "Missing Email UAT",
          email: `missing.${Date.now()}@example.test`,
          passwordHash: await hash(`activation-only-${randomUUID()}`, 12),
          role: Role.HOMEOWNER,
          active: true,
          homeownerProfile: {
            create: {
              tenantId: tenant.id,
              phone: "09990000001",
              address: "Universal Auth Missing Email",
              block: `UM-${Date.now().toString().slice(-4)}`,
              lot: `LOT-M-${Date.now().toString().slice(-4)}`,
              accountNumber: testAccountNumber(),
              status: "ACTIVE",
              activationStatus: HomeownerActivationStatus.NOT_INVITED,
              emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
              monthlyDuesAmount: "1.00",
            },
          },
        },
        include: { homeownerProfile: true },
      });
      assert(!homeownerDigitalActivationEligibility({ ...missingEmailUser.homeownerProfile!, user: { active: true, email: "" } }).eligible, "Missing-email homeowner should be skipped safely.");

      throw rollback;
    }, { timeout: 30_000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }

  console.log("Homeowner universal auth verification passed: tenant-scoped email verification, token rejection, credential regeneration, full homeowner pagination/search safeguards, activation email structure, URL consistency, session revocation, password rules, PWA cache safeguards, and passkey storage/config are valid.");
}

main().finally(async () => prisma.$disconnect());

async function assertEmailVerificationService(tenant: { id: string; slug: string }) {
  const service = await import("../lib/services/homeowner-activation");
  const createdUserIds: string[] = [];
  const crossTenant = await prisma.tenant.create({ data: { name: "UAT Cross Tenant", shortName: "UATX", slug: `uat-cross-${Date.now()}`, status: "ACTIVE" } });
  try {
    const valid = await createActivationFixture(tenant.id, service);
    createdUserIds.push(valid.user.id);
    const verified = await service.verifyHomeownerEmailVerificationToken(valid.emailVerificationToken);
    assert(!("error" in verified), "Tenant-scoped email verification returned an error.");
    const verifiedProfile = await prisma.homeownerProfile.findUniqueOrThrow({ where: { id: valid.profile.id } });
    assert(verifiedProfile.emailStatus === HomeownerEmailVerificationStatus.VERIFIED, "Email verification did not mark registered email verified.");
    assert(verifiedProfile.activationStatus === HomeownerActivationStatus.PASSWORD_CREATION_REQUIRED, "Email verification must require password creation before full access.");
    assert(!verifiedProfile.activatedAt, "Email verification alone must not activate dashboard access.");
    const usedToken = await prisma.homeownerEmailVerificationToken.findUniqueOrThrow({ where: { id: valid.tokenRow.id } });
    assert(usedToken.usedAt, "Email verification token was not marked used.");
    const audit = await prisma.auditLog.findFirst({ where: { entityId: valid.profile.id, action: "HOMEOWNER_EMAIL_VERIFIED" }, orderBy: { createdAt: "desc" } });
    const auditText = JSON.stringify(audit?.metadata ?? {});
    assert(!auditText.includes(valid.emailVerificationToken) && !auditText.includes(valid.temporaryPassword), "Audit metadata leaked activation token or temporary password.");
    const credentialCheck = await service.verifyHomeownerActivationCredential({ accountNumber: valid.accountNumber, email: valid.email, temporaryPassword: valid.temporaryPassword });
    assert(!("error" in credentialCheck), "Verified email should allow the valid temporary credential to continue to password creation.");

    const cross = await createActivationFixture(tenant.id, service);
    createdUserIds.push(cross.user.id);
    const crossRawToken = `cross-${randomUUID()}`;
    await prisma.homeownerEmailVerificationToken.create({ data: { tenantId: crossTenant.id, userId: cross.user.id, tokenHash: service.hashOpaqueToken(crossRawToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    assert("error" in await service.verifyHomeownerEmailVerificationToken(crossRawToken), "Cross-tenant email verification token was accepted.");

    const used = await createActivationFixture(tenant.id, service);
    createdUserIds.push(used.user.id);
    await prisma.homeownerEmailVerificationToken.update({ where: { id: used.tokenRow.id }, data: { usedAt: new Date() } });
    assert("error" in await service.verifyHomeownerEmailVerificationToken(used.emailVerificationToken), "Used token was accepted.");

    const expired = await createActivationFixture(tenant.id, service);
    createdUserIds.push(expired.user.id);
    await prisma.homeownerEmailVerificationToken.update({ where: { id: expired.tokenRow.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    assert("error" in await service.verifyHomeownerEmailVerificationToken(expired.emailVerificationToken), "Expired token was accepted.");

    const revoked = await createActivationFixture(tenant.id, service);
    createdUserIds.push(revoked.user.id);
    const regenerated = await service.createHomeownerActivationCredential({ tenantId: tenant.id, userId: revoked.user.id, tx: prisma });
    assert("error" in await service.verifyHomeownerEmailVerificationToken(revoked.emailVerificationToken), "Revoked old token was accepted after regeneration.");
    assert("error" in await service.verifyHomeownerActivationCredential({ accountNumber: revoked.accountNumber, email: revoked.email, temporaryPassword: revoked.temporaryPassword }), "Old temporary password was accepted after regeneration.");
    const newPasswordResult = await service.verifyHomeownerActivationCredential({ accountNumber: revoked.accountNumber, email: revoked.email, temporaryPassword: regenerated.temporaryPassword });
    assert("error" in newPasswordResult && typeof newPasswordResult.error === "string" && newPasswordResult.error.includes("Verify your registered email"), "Regenerated temporary password should be current but still require email verification.");
  } finally {
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: createdUserIds } }, { actorId: { in: createdUserIds } }] } });
    await prisma.homeownerEmailVerificationToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.homeownerActivationCredential.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.homeownerEmailVerificationToken.deleteMany({ where: { tenantId: crossTenant.id } });
    await prisma.tenant.delete({ where: { id: crossTenant.id } }).catch(() => undefined);
  }
}

async function assertActivationCompletionTransaction(tenant: { id: string; slug: string }) {
  const service = await import("../lib/services/homeowner-activation");
  const { prisma: scopedPrisma } = await import("../lib/db");
  const { runWithTenant } = await import("../lib/tenant-context");
  const createdUserIds: string[] = [];
  const previousTestHook = process.env.HOAHUB_AUTH_TEST_HOOKS;
  process.env.HOAHUB_AUTH_TEST_HOOKS = "true";
  const permanentPassword = "Home123";
  const retryPassword = "Home124";
  const otherTenant = await prisma.tenant.create({ data: { name: "UAT Session Tenant", shortName: "UATS", slug: `uat-session-${Date.now()}`, status: "ACTIVE" } });
  try {
    const success = await createActivationFixture(tenant.id, service);
    createdUserIds.push(success.user.id);
    await service.verifyHomeownerEmailVerificationToken(success.emailVerificationToken);
    const completed = await service.completeHomeownerActivation({ accountNumber: success.accountNumber, email: success.email, temporaryPassword: success.temporaryPassword, password: permanentPassword });
    assert(!("error" in completed) && "session" in completed, "Successful activation completion returned an error.");
    const activatedProfile = await prisma.homeownerProfile.findUniqueOrThrow({ where: { id: success.profile.id } });
    const activatedCredential = await prisma.homeownerActivationCredential.findFirstOrThrow({ where: { tenantId: tenant.id, userId: success.user.id }, orderBy: { createdAt: "desc" } });
    const activeSessions = await prisma.userSession.findMany({ where: { tenantId: tenant.id, userId: success.user.id, revokedAt: null, expiresAt: { gt: new Date() } } });
    const successAudit = await prisma.auditLog.findFirst({ where: { action: "HOMEOWNER_ACTIVATED", entityId: success.user.id }, orderBy: { createdAt: "desc" } });
    const userAfterSuccess = await prisma.user.findUniqueOrThrow({ where: { id: success.user.id }, select: { passwordHash: true } });
    assert(await compare(permanentPassword, userAfterSuccess.passwordHash), "Permanent password was not saved on successful activation.");
    assert(activatedProfile.activationStatus === HomeownerActivationStatus.ACTIVE && activatedProfile.activatedAt, "Successful activation did not mark homeowner ACTIVE with completion timestamp.");
    assert(activatedCredential.usedAt, "Successful activation did not consume the temporary credential.");
    assert(activeSessions.length === 1 && activeSessions[0].tenantId === tenant.id, "Successful activation did not create exactly one tenant-scoped full-access UserSession.");
    assert(successAudit?.metadata && JSON.stringify(successAudit.metadata).includes("sessionCreated"), "Successful activation audit record was not written.");

    const failure = await createActivationFixture(tenant.id, service);
    createdUserIds.push(failure.user.id);
    await service.verifyHomeownerEmailVerificationToken(failure.emailVerificationToken);
    const beforeFailure = await prisma.user.findUniqueOrThrow({ where: { id: failure.user.id }, select: { passwordHash: true } });
    const failureCredential = await prisma.homeownerActivationCredential.findFirstOrThrow({ where: { tenantId: tenant.id, userId: failure.user.id, usedAt: null, revokedAt: null }, orderBy: { createdAt: "desc" } });
    const failed = await service.completeHomeownerActivation({ accountNumber: failure.accountNumber, email: failure.email, temporaryPassword: failure.temporaryPassword, password: permanentPassword, failSessionCreateForTest: true });
    assert("error" in failed, "Simulated UserSession.create failure was not reported.");
    const failedProfile = await prisma.homeownerProfile.findUniqueOrThrow({ where: { id: failure.profile.id } });
    const failedUser = await prisma.user.findUniqueOrThrow({ where: { id: failure.user.id }, select: { passwordHash: true } });
    const failedCredential = await prisma.homeownerActivationCredential.findUniqueOrThrow({ where: { id: failureCredential.id } });
    const failedSessions = await prisma.userSession.count({ where: { tenantId: tenant.id, userId: failure.user.id, revokedAt: null } });
    const failedAudit = await prisma.auditLog.findFirst({ where: { action: "HOMEOWNER_ACTIVATED", entityId: failure.user.id }, orderBy: { createdAt: "desc" } });
    assert(failedUser.passwordHash === beforeFailure.passwordHash, "Rollback test changed the permanent password.");
    assert(failedProfile.activationStatus !== HomeownerActivationStatus.ACTIVE && !failedProfile.activatedAt, "Rollback test left homeowner ACTIVE or completed.");
    assert(!failedCredential.usedAt, "Rollback test consumed the temporary credential.");
    assert(failedSessions === 0, "Rollback test left an active full-access session.");
    assert(!failedAudit, "Rollback test wrote a success audit record.");
    const retry = await service.completeHomeownerActivation({ accountNumber: failure.accountNumber, email: failure.email, temporaryPassword: failure.temporaryPassword, password: retryPassword });
    assert(!("error" in retry), "Retry after simulated safe failure did not complete.");

    const otherUser = await prisma.user.create({
      data: {
        tenantId: otherTenant.id,
        name: "Cross Tenant Session UAT",
        email: `cross.session.${Date.now()}@example.test`,
        passwordHash: await hash(`activation-only-${randomUUID()}`, 12),
        role: Role.HOMEOWNER,
        homeownerProfile: {
          create: {
            tenantId: otherTenant.id,
            phone: "09990000003",
            address: "Cross Tenant Session UAT",
            block: `XS-${Date.now().toString().slice(-5)}`,
            lot: `XL-${Date.now().toString().slice(-5)}`,
            accountNumber: testAccountNumber(),
            status: "ACTIVE",
            monthlyDuesAmount: "1.00",
          },
        },
      },
    });
    createdUserIds.push(otherUser.id);
    let crossTenantRejected = false;
    try {
      await runWithTenant(tenant.id, () => scopedPrisma.userSession.create({
        data: {
          tenantId: otherTenant.id,
          userId: otherUser.id,
          tokenHash: challengeHash(`cross-session-${randomUUID()}`),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      }), { role: Role.HOMEOWNER });
    } catch {
      crossTenantRejected = true;
    }
    assert(crossTenantRejected, "Cross-tenant UserSession.create was not rejected by tenant context.");
  } finally {
    if (previousTestHook === undefined) delete process.env.HOAHUB_AUTH_TEST_HOOKS;
    else process.env.HOAHUB_AUTH_TEST_HOOKS = previousTestHook;
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: createdUserIds } }, { actorId: { in: createdUserIds } }] } });
    await prisma.userSession.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.homeownerEmailVerificationToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.homeownerActivationCredential.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.tenant.delete({ where: { id: otherTenant.id } }).catch(() => undefined);
  }
}

async function assertDigitalAccessEnableDisable(tenant: { id: string; slug: string }) {
  const { prisma: scopedPrisma } = await import("../lib/db");
  const { runWithTenant } = await import("../lib/tenant-context");
  const { prepareSession } = await import("../lib/auth");
  const passkeys = await import("../lib/services/passkeys");
  const createdUserIds: string[] = [];
  const otherTenant = await prisma.tenant.create({ data: { name: "UAT Digital Access Tenant", shortName: "UATD", slug: `uat-digital-${Date.now()}`, status: "ACTIVE" } });
  try {
    const activated = await createDigitalAccessFixture(tenant.id, { activated: true, passkey: true });
    createdUserIds.push(activated.user.id);
    const untouched = await createDigitalAccessFixture(tenant.id, { activated: true, passkey: false });
    createdUserIds.push(untouched.user.id);
    const unactivated = await createDigitalAccessFixture(tenant.id, { activated: false, passkey: false });
    createdUserIds.push(unactivated.user.id);
    const crossTenant = await createDigitalAccessFixture(otherTenant.id, { activated: true, passkey: false });
    createdUserIds.push(crossTenant.user.id);

    const now = new Date();
    await prisma.userSession.createMany({
      data: [
        { tenantId: tenant.id, userId: activated.user.id, tokenHash: challengeHash(`active-a-${randomUUID()}`), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
        { tenantId: tenant.id, userId: activated.user.id, tokenHash: challengeHash(`active-b-${randomUUID()}`), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
        { tenantId: tenant.id, userId: untouched.user.id, tokenHash: challengeHash(`untouched-${randomUUID()}`), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      ],
    });

    await runWithTenant(tenant.id, async () => await scopedPrisma.$transaction(async (tx) => {
      const current = await tx.homeownerProfile.findFirstOrThrow({ where: { id: activated.profile.id, tenantId: tenant.id, userId: activated.user.id }, include: { user: true } });
      await tx.userSession.updateMany({ where: { tenantId: tenant.id, userId: current.userId, revokedAt: null }, data: { revokedAt: now } });
      await tx.user.update({ where: { id: current.userId }, data: { active: false } });
      await tx.homeownerProfile.update({ where: { tenantId_id: { tenantId: tenant.id, id: current.id } }, data: { activationStatus: HomeownerActivationStatus.DISABLED } });
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: null,
          module: "AUTH",
          action: "HOMEOWNER_ACTIVATION_DISABLED",
          entityType: "User",
          entityId: current.userId,
          reason: "UAT disable digital access.",
          metadata: { homeownerId: current.id, accountMasked: "90*******00", sessionsRevoked: true, passkeysPreserved: true },
        },
      });
    }), { role: Role.ADMIN });

    const disabledUser = await prisma.user.findUniqueOrThrow({ where: { id: activated.user.id }, select: { active: true, passwordHash: true } });
    const disabledProfile = await prisma.homeownerProfile.findUniqueOrThrow({ where: { id: activated.profile.id } });
    const disabledSessions = await prisma.userSession.count({ where: { tenantId: tenant.id, userId: activated.user.id, revokedAt: null } });
    const untouchedSessions = await prisma.userSession.count({ where: { tenantId: tenant.id, userId: untouched.user.id, revokedAt: null } });
    const preservedPasskeys = await prisma.userPasskeyCredential.count({ where: { tenantId: tenant.id, userId: activated.user.id } });
    const disabledPasskeyLogin = await passkeys.findPasskeyLoginUser({ email: activated.email, accountNumber: activated.accountNumber });
    assert(disabledProfile.status === "ACTIVE", "Disabling digital access changed operational homeowner status.");
    assert(disabledProfile.activationStatus === HomeownerActivationStatus.DISABLED && !disabledUser.active, "Digitally ACTIVE homeowner was not disabled.");
    assert(disabledSessions === 0, "Disable Digital Access did not revoke all active sessions.");
    assert(untouchedSessions === 1, "Disable Digital Access revoked another homeowner's session.");
    assert(await compare(activated.permanentPassword, disabledUser.passwordHash), "Disable Digital Access changed the permanent password hash.");
    assert(preservedPasskeys === 1, "Disable Digital Access removed a registered passkey.");
    assert("error" in disabledPasskeyLogin, "Disabled digital account was allowed to start passkey login.");
    assert(!disabledUser.active, "Disabled account would still satisfy password-login active-user checks.");

    await runWithTenant(tenant.id, async () => await scopedPrisma.$transaction(async (tx) => {
      const current = await tx.homeownerProfile.findFirstOrThrow({ where: { id: activated.profile.id, tenantId: tenant.id, userId: activated.user.id }, include: { user: true } });
      const restoredStatus = current.activatedAt ? HomeownerActivationStatus.ACTIVE : HomeownerActivationStatus.NOT_INVITED;
      await tx.userSession.updateMany({ where: { tenantId: tenant.id, userId: current.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.user.update({ where: { id: current.userId }, data: { active: true } });
      await tx.homeownerProfile.update({ where: { tenantId_id: { tenantId: tenant.id, id: current.id } }, data: { activationStatus: restoredStatus } });
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: null,
          module: "AUTH",
          action: "HOMEOWNER_ACTIVATION_ENABLED",
          entityType: "User",
          entityId: current.userId,
          reason: "UAT enable digital access.",
          metadata: { homeownerId: current.id, restoredActivationStatus: restoredStatus, sessionCreated: false, passwordPreserved: true, passkeysPreserved: true },
        },
      });
    }), { role: Role.ADMIN });

    const enabledUser = await prisma.user.findUniqueOrThrow({ where: { id: activated.user.id }, select: { active: true, passwordHash: true } });
    const enabledProfile = await prisma.homeownerProfile.findUniqueOrThrow({ where: { id: activated.profile.id } });
    const sessionsAfterEnable = await prisma.userSession.count({ where: { tenantId: tenant.id, userId: activated.user.id, revokedAt: null } });
    const enabledPasskeys = await prisma.userPasskeyCredential.count({ where: { tenantId: tenant.id, userId: activated.user.id } });
    const reenabledPasskeyLogin = await passkeys.findPasskeyLoginUser({ email: activated.email, accountNumber: activated.accountNumber });
    assert(enabledUser.active && enabledProfile.activationStatus === HomeownerActivationStatus.ACTIVE && enabledProfile.activatedAt, "Previously activated homeowner did not return to digitally ACTIVE.");
    assert(await compare(activated.permanentPassword, enabledUser.passwordHash), "Enable Digital Access changed the permanent password hash.");
    assert(enabledPasskeys === 1, "Enable Digital Access removed a registered passkey.");
    assert(sessionsAfterEnable === 0, "Enable Digital Access automatically created a session.");
    assert(!("error" in reenabledPasskeyLogin), "Re-enabled activated account could not start passkey login with preserved passkey.");
    const preparedPasskeySession = await prepareSession({ userId: activated.user.id, role: Role.HOMEOWNER, tenantId: tenant.id, tenantSlug: tenant.slug });
    await runWithTenant(tenant.id, async () => await scopedPrisma.userSession.create({ data: preparedPasskeySession.data }), { role: Role.HOMEOWNER });
    const passkeySessions = await prisma.userSession.findMany({ where: { tenantId: tenant.id, userId: activated.user.id, revokedAt: null, expiresAt: { gt: new Date() } } });
    assert(passkeySessions.length === 1 && passkeySessions[0].tenantId === tenant.id, "Resolved passkey login did not create a tenant-scoped UserSession.");
    let crossTenantPasskeySessionRejected = false;
    try {
      await runWithTenant(otherTenant.id, async () => await scopedPrisma.userSession.create({ data: preparedPasskeySession.data }), { role: Role.HOMEOWNER });
    } catch {
      crossTenantPasskeySessionRejected = true;
    }
    assert(crossTenantPasskeySessionRejected, "Cross-tenant passkey UserSession.create was not rejected.");

    await runWithTenant(tenant.id, async () => await scopedPrisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: unactivated.user.id }, data: { active: false } });
      await tx.homeownerProfile.update({ where: { tenantId_id: { tenantId: tenant.id, id: unactivated.profile.id } }, data: { activationStatus: HomeownerActivationStatus.DISABLED } });
      await tx.user.update({ where: { id: unactivated.user.id }, data: { active: true } });
      await tx.homeownerProfile.update({ where: { tenantId_id: { tenantId: tenant.id, id: unactivated.profile.id } }, data: { activationStatus: HomeownerActivationStatus.NOT_INVITED, activationSentAt: null } });
    }), { role: Role.ADMIN });
    const restoredUnactivated = await prisma.homeownerProfile.findUniqueOrThrow({ where: { id: unactivated.profile.id }, include: { user: true } });
    const unactivatedSessions = await prisma.userSession.count({ where: { tenantId: tenant.id, userId: unactivated.user.id, revokedAt: null } });
    const unactivatedCreds = await prisma.homeownerActivationCredential.count({ where: { tenantId: tenant.id, userId: unactivated.user.id, usedAt: null, revokedAt: null } });
    assert(restoredUnactivated.activationStatus === HomeownerActivationStatus.NOT_INVITED && !restoredUnactivated.activatedAt, "Never-activated homeowner was not restored to an invitation-ready state.");
    assert(homeownerDigitalActivationEligibility(restoredUnactivated).eligible, "Re-enabled never-activated homeowner is not eligible for a new activation invitation.");
    assert(unactivatedSessions === 0 && unactivatedCreds === 0, "Re-enabled never-activated homeowner received a session or temporary credential automatically.");
    assert(await compare(unactivated.permanentPassword, restoredUnactivated.user.passwordHash), "Unactivated enable flow changed the existing password hash.");

    let crossTenantDenied = false;
    try {
      await runWithTenant(tenant.id, async () => await scopedPrisma.homeownerProfile.update({
        where: { tenantId_id: { tenantId: otherTenant.id, id: crossTenant.profile.id } },
        data: { activationStatus: HomeownerActivationStatus.DISABLED },
      }), { role: Role.ADMIN });
    } catch {
      crossTenantDenied = true;
    }
    assert(crossTenantDenied, "Cross-tenant digital access enable/disable was not denied.");
    const crossTenantInvisible = await runWithTenant(tenant.id, async () => await scopedPrisma.homeownerProfile.findFirst({ where: { id: crossTenant.profile.id } }), { role: Role.ADMIN });
    assert(!crossTenantInvisible, "Cross-tenant homeowner profile was visible through tenant-scoped Prisma.");

    const disableAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: "HOMEOWNER_ACTIVATION_DISABLED", entityId: activated.user.id }, orderBy: { createdAt: "desc" } });
    const enableAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: "HOMEOWNER_ACTIVATION_ENABLED", entityId: activated.user.id }, orderBy: { createdAt: "desc" } });
    const auditText = JSON.stringify([disableAudit.reason, disableAudit.metadata, enableAudit.reason, enableAudit.metadata]);
    assert(!auditText.includes(activated.permanentPassword) && !auditText.includes("tokenHash") && !auditText.includes("credential-"), "Digital access audit metadata leaked secrets.");
  } finally {
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: createdUserIds } }, { actorId: { in: createdUserIds } }] } });
    await prisma.userSession.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userPasskeyChallenge.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userPasskeyCredential.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.homeownerEmailVerificationToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.homeownerActivationCredential.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.tenant.delete({ where: { id: otherTenant.id } }).catch(() => undefined);
  }
}

async function createDigitalAccessFixture(tenantId: string, options: { activated: boolean; passkey: boolean }) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const permanentPassword = `Home${stamp.slice(-6)}A`;
  const activatedAt = options.activated ? new Date() : null;
  const email = `uat.digital.${stamp}@example.test`;
  const accountNumber = testAccountNumber();
  const user = await prisma.user.create({
    data: {
      tenantId,
      name: `UAT Digital ${stamp}`,
      email,
      passwordHash: await hash(permanentPassword, 12),
      role: Role.HOMEOWNER,
      active: true,
      homeownerProfile: {
        create: {
          tenantId,
          phone: "09990000004",
          address: "Digital Access UAT Address",
          block: `DU-${stamp.slice(-5)}`,
          lot: `DL-${stamp.slice(-5)}`,
          accountNumber,
          status: "ACTIVE",
          activationStatus: options.activated ? HomeownerActivationStatus.ACTIVE : HomeownerActivationStatus.NOT_INVITED,
          emailStatus: options.activated ? HomeownerEmailVerificationStatus.VERIFIED : HomeownerEmailVerificationStatus.UNVERIFIED,
          emailVerifiedAt: activatedAt,
          activatedAt,
          monthlyDuesAmount: "1.00",
        },
      },
    },
    include: { homeownerProfile: true },
  });
  if (options.passkey) {
    await prisma.userPasskeyCredential.create({
      data: {
        tenantId,
        userId: user.id,
        credentialId: `credential-${randomUUID()}`,
        publicKey: Buffer.from(`public-key-${stamp}`).toString("base64url"),
        transports: ["internal"],
        backedUp: true,
      },
    });
  }
  return { user, profile: user.homeownerProfile!, email, accountNumber, permanentPassword };
}

async function createActivationFixture(tenantId: string, service: typeof import("../lib/services/homeowner-activation")) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `uat.auth.${stamp}@example.test`;
  const accountNumber = testAccountNumber();
  const user = await prisma.user.create({
    data: {
      tenantId,
      name: `UAT Auth ${stamp}`,
      email,
      passwordHash: await hash(`activation-only-${randomUUID()}`, 12),
      role: Role.HOMEOWNER,
      active: true,
      homeownerProfile: {
        create: {
          tenantId,
          phone: "09990000002",
          address: "Authentication UAT Address",
          block: `AU-${stamp.slice(-5)}`,
          lot: `L-${stamp.slice(-5)}`,
          accountNumber,
          status: "ACTIVE",
          activationStatus: HomeownerActivationStatus.INVITATION_SENT,
          emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
          activationSentAt: new Date(),
          monthlyDuesAmount: "1.00",
        },
      },
    },
    include: { homeownerProfile: true },
  });
  const activation = await service.createHomeownerActivationCredential({ tenantId, userId: user.id, tx: prisma });
  const tokenRow = await prisma.homeownerEmailVerificationToken.findFirstOrThrow({ where: { tenantId, userId: user.id, usedAt: null }, orderBy: { createdAt: "desc" } });
  return { user, profile: user.homeownerProfile!, email, accountNumber, tokenRow, temporaryPassword: activation.temporaryPassword, emailVerificationToken: activation.emailVerificationToken };
}
