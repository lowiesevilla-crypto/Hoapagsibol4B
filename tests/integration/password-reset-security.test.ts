import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Role } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { platformPrisma } from "@/lib/db";
import { completePasswordReset } from "@/lib/services/password-reset-completion";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `password-reset-it-${process.pid}`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const userAId = `${runId}-user-a`;
const userBId = `${runId}-user-b`;
const tokenAId = `${runId}-token-a`;
const siblingTokenAId = `${runId}-token-a-sibling`;
const tokenBId = `${runId}-token-b`;
const tenantIds = [tenantAId, tenantBId];
const oldPassword = "Old-Integration-Password-2026!";
const newPassword = "New-Integration-Password-2026!";
let newPasswordHash = "";

function inTenant<T>(tenantId: string, callback: () => T) {
  return runWithTenant(tenantId, callback, { role: Role.HOMEOWNER });
}

async function cleanFixtures() {
  await platformPrisma.passwordResetToken.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await platformPrisma.userSession.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await platformPrisma.auditLog.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await platformPrisma.user.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await platformPrisma.tenant.deleteMany({
    where: { id: { in: tenantIds } },
  });
}

before(async () => {
  await cleanFixtures();
  const oldPasswordHash = await hash(oldPassword, 4);
  newPasswordHash = await hash(newPassword, 4);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const alreadyRevokedAt = new Date(Date.now() - 60 * 1000);

  await platformPrisma.tenant.createMany({
    data: [
      { id: tenantAId, name: "Password Reset Tenant A", shortName: "PR-A", slug: `${runId}-a` },
      { id: tenantBId, name: "Password Reset Tenant B", shortName: "PR-B", slug: `${runId}-b` },
    ],
  });
  await platformPrisma.user.createMany({
    data: [
      {
        id: userAId,
        tenantId: tenantAId,
        name: "Password Reset User A",
        email: `${runId}-a@example.invalid`,
        passwordHash: oldPasswordHash,
        role: Role.HOMEOWNER,
      },
      {
        id: userBId,
        tenantId: tenantBId,
        name: "Password Reset User B",
        email: `${runId}-b@example.invalid`,
        passwordHash: oldPasswordHash,
        role: Role.HOMEOWNER,
      },
    ],
  });
  await platformPrisma.passwordResetToken.createMany({
    data: [
      {
        id: tokenAId,
        tenantId: tenantAId,
        userId: userAId,
        tokenHash: `${runId}-token-hash-a`,
        expiresAt,
      },
      {
        id: siblingTokenAId,
        tenantId: tenantAId,
        userId: userAId,
        tokenHash: `${runId}-token-hash-a-sibling`,
        expiresAt,
      },
      {
        id: tokenBId,
        tenantId: tenantBId,
        userId: userBId,
        tokenHash: `${runId}-token-hash-b`,
        expiresAt,
      },
    ],
  });
  await platformPrisma.userSession.createMany({
    data: [
      {
        id: `${runId}-session-a-1`,
        tenantId: tenantAId,
        userId: userAId,
        tokenHash: `${runId}-session-hash-a-1`,
        expiresAt: sessionExpiresAt,
      },
      {
        id: `${runId}-session-a-2`,
        tenantId: tenantAId,
        userId: userAId,
        tokenHash: `${runId}-session-hash-a-2`,
        expiresAt: sessionExpiresAt,
      },
      {
        id: `${runId}-session-a-revoked`,
        tenantId: tenantAId,
        userId: userAId,
        tokenHash: `${runId}-session-hash-a-revoked`,
        expiresAt: sessionExpiresAt,
        revokedAt: alreadyRevokedAt,
      },
      {
        id: `${runId}-session-b-1`,
        tenantId: tenantBId,
        userId: userBId,
        tokenHash: `${runId}-session-hash-b-1`,
        expiresAt: sessionExpiresAt,
      },
    ],
  });
});

after(cleanFixtures);

test("password reset atomically changes credentials, consumes tokens, revokes active sessions, and audits the result", async () => {
  const result = await inTenant(tenantAId, () =>
    completePasswordReset({
      tokenId: tokenAId,
      userId: userAId,
      passwordHash: newPasswordHash,
    }),
  );
  assert.equal(result.sessionsRevoked, 2);

  const [user, sessions, tokens, audit, tenantBSession] = await Promise.all([
    platformPrisma.user.findUniqueOrThrow({ where: { id: userAId } }),
    platformPrisma.userSession.findMany({
      where: { tenantId: tenantAId, userId: userAId },
      orderBy: { id: "asc" },
    }),
    platformPrisma.passwordResetToken.findMany({
      where: { tenantId: tenantAId, userId: userAId },
    }),
    platformPrisma.auditLog.findFirst({
      where: {
        tenantId: tenantAId,
        actorId: userAId,
        action: "PASSWORD_RESET_COMPLETED",
      },
    }),
    platformPrisma.userSession.findUniqueOrThrow({
      where: { tokenHash: `${runId}-session-hash-b-1` },
    }),
  ]);

  assert.equal(await compare(newPassword, user.passwordHash), true);
  assert.equal(await compare(oldPassword, user.passwordHash), false);
  assert.equal(sessions.every((session) => session.revokedAt !== null), true);
  assert.equal(tokens.every((token) => token.usedAt !== null), true);
  assert.equal(tenantBSession.revokedAt, null, "Another tenant's active session must remain untouched.");
  assert.ok(audit, "Expected password reset audit evidence.");
  const metadata = audit.metadata as { resetTokenId?: string; sessionsRevoked?: number } | null;
  assert.equal(metadata?.resetTokenId, tokenAId);
  assert.equal(metadata?.sessionsRevoked, 2);
});

test("a consumed password reset token cannot be replayed", async () => {
  await assert.rejects(
    () =>
      inTenant(tenantAId, () =>
        completePasswordReset({
          tokenId: tokenAId,
          userId: userAId,
          passwordHash: newPasswordHash,
        }),
      ),
    /RESET_TOKEN_ALREADY_USED/,
  );

  assert.equal(
    await platformPrisma.auditLog.count({
      where: {
        tenantId: tenantAId,
        actorId: userAId,
        action: "PASSWORD_RESET_COMPLETED",
      },
    }),
    1,
    "A replay attempt must not create a second success audit record.",
  );
});

test("tenant A cannot consume tenant B reset tokens or revoke tenant B sessions", async () => {
  const tenantBUserBefore = await platformPrisma.user.findUniqueOrThrow({ where: { id: userBId } });

  await assert.rejects(
    () =>
      inTenant(tenantAId, () =>
        completePasswordReset({
          tokenId: tokenBId,
          userId: userBId,
          passwordHash: newPasswordHash,
        }),
      ),
    /RESET_TOKEN_ALREADY_USED/,
  );

  const [tenantBUserAfter, tenantBToken, tenantBSession, tenantBAudits] = await Promise.all([
    platformPrisma.user.findUniqueOrThrow({ where: { id: userBId } }),
    platformPrisma.passwordResetToken.findUniqueOrThrow({
      where: { tokenHash: `${runId}-token-hash-b` },
    }),
    platformPrisma.userSession.findUniqueOrThrow({
      where: { tokenHash: `${runId}-session-hash-b-1` },
    }),
    platformPrisma.auditLog.count({
      where: {
        tenantId: tenantBId,
        actorId: userBId,
        action: "PASSWORD_RESET_COMPLETED",
      },
    }),
  ]);

  assert.equal(tenantBUserAfter.passwordHash, tenantBUserBefore.passwordHash);
  assert.equal(tenantBToken.usedAt, null);
  assert.equal(tenantBSession.revokedAt, null);
  assert.equal(tenantBAudits, 0);
});
