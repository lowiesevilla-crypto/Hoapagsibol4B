import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type CompletePasswordResetInput = {
  tokenId: string;
  userId: string;
  passwordHash: string;
};

export async function completePasswordReset({
  tokenId,
  userId,
  passwordHash,
}: CompletePasswordResetInput) {
  return prisma.$transaction(
    async (tx) => {
      const completedAt = new Date();
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: tokenId,
          userId,
          usedAt: null,
          expiresAt: { gt: completedAt },
        },
        data: { usedAt: completedAt },
      });
      if (consumed.count !== 1) throw new Error("RESET_TOKEN_ALREADY_USED");

      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: completedAt },
      });
      const revokedSessions = await tx.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: completedAt },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          module: "AUTH",
          action: "PASSWORD_RESET_COMPLETED",
          entityType: "User",
          entityId: userId,
          metadata: {
            resetTokenId: tokenId,
            sessionsRevoked: revokedSessions.count,
          },
        },
      });

      return { sessionsRevoked: revokedSessions.count, completedAt };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
