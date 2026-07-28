import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { compare, hash } from "bcryptjs";
import { HomeownerActivationStatus, HomeownerEmailVerificationStatus, PrismaClient, Role } from "@prisma/client";

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
  return `9${String(Date.now()).slice(-10)}`;
}

function assertSourceSafeguards() {
  const manifest = readFileSync("app/manifest.ts", "utf8");
  const nextConfig = readFileSync("next.config.ts", "utf8");
  const loginForm = readFileSync("components/login-form.tsx", "utf8");
  const passkeyService = readFileSync("lib/services/passkeys.ts", "utf8");
  const homeownerActions = readFileSync("lib/actions/homeowners.ts", "utf8");
  const searchInput = readFileSync("components/ui.tsx", "utf8");
  const activationService = readFileSync("lib/services/homeowner-activation.ts", "utf8");
  assert(manifest.includes('start_url: "/login"'), "PWA manifest must start installed apps at universal login.");
  assert(nextConfig.includes("no-store, max-age=0"), "Auth/protected routes must send no-store cache headers.");
  assert(nextConfig.includes("publickey-credentials-create=(self)") && nextConfig.includes("publickey-credentials-get=(self)"), "Passkey browser permissions are not configured.");
  assert(loginForm.includes("PasskeyLoginButton"), "Universal login must expose passkey login.");
  assert(passkeyService.includes("verifyRegistrationResponse") && passkeyService.includes("verifyAuthenticationResponse"), "Passkey implementation must use server-side WebAuthn verification.");
  assert(homeownerActions.includes("regenerateHomeownerActivationAction") && homeownerActions.includes("disableHomeownerActivationAction"), "Admin activation management actions are missing.");
  assert(searchInput.includes("terms.some((term) => !haystack.includes(term))"), "Admin search must match typed terms independently.");
  assert(searchInput.includes('normalize("NFKD")'), "Admin search must normalize accented search text.");
  assert(activationService.includes("HOMEOWNER_ACTIVATION_EMAIL_ATTEMPTED"), "Activation email attempts must be audited safely.");
  assert(activationService.includes("homeownerEmailVerificationToken.create"), "Activation credential generation must create an email-verification record.");
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

async function main() {
  requireLocalClone();
  assertSourceSafeguards();
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
              activationStatus: HomeownerActivationStatus.PENDING_ACTIVATION,
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
        data: { activationStatus: HomeownerActivationStatus.PENDING_ACTIVATION, activationSentAt: new Date() },
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

      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }

  console.log("Homeowner universal auth verification passed: activation, tenant isolation, session revocation, password rules, email verification, PWA cache safeguards, and passkey storage/config are valid.");
}

main().finally(async () => prisma.$disconnect());
