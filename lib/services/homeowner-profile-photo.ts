import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

export type HomeownerProfilePhoto = {
  storedName: string;
  contentType: string;
  size: number;
  updatedAt: Date;
};

type PhotoRow = HomeownerProfilePhoto;

export async function getHomeownerProfilePhoto(tenantId: string, userId: string): Promise<HomeownerProfilePhoto | null> {
  const rows = await prisma.$queryRaw<PhotoRow[]>`
    SELECT storedName, contentType, size, updatedAt
    FROM HomeownerProfilePhoto
    WHERE tenantId = ${tenantId} AND userId = ${userId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function saveHomeownerProfilePhoto(input: {
  tenantId: string;
  userId: string;
  storedName: string;
  contentType: string;
  size: number;
}) {
  await prisma.$executeRaw`
    INSERT INTO HomeownerProfilePhoto (id, tenantId, userId, storedName, contentType, size, createdAt, updatedAt)
    VALUES (${randomUUID()}, ${input.tenantId}, ${input.userId}, ${input.storedName}, ${input.contentType}, ${input.size}, NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE
      storedName = VALUES(storedName),
      contentType = VALUES(contentType),
      size = VALUES(size),
      updatedAt = NOW(3)
  `;
  return getHomeownerProfilePhoto(input.tenantId, input.userId);
}

export async function deleteHomeownerProfilePhoto(tenantId: string, userId: string) {
  await prisma.$executeRaw`
    DELETE FROM HomeownerProfilePhoto
    WHERE tenantId = ${tenantId} AND userId = ${userId}
  `;
}
