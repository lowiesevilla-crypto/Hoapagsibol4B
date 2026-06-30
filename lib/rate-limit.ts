import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

function fingerprint(action: string, key: string) {
  return createHash("sha256").update(`${action}:${key}:${process.env.AUTH_SECRET || "development"}`).digest("hex");
}

export async function rateLimitAvailable(action: string, key: string, limit: number, windowMs: number) {
  const keyHash = fingerprint(action, key);
  const count = await prisma.rateLimitEvent.count({ where: { action, keyHash, createdAt: { gte: new Date(Date.now() - windowMs) } } });
  return count < limit;
}

export async function recordRateLimitFailure(action: string, key: string) {
  return prisma.rateLimitEvent.create({ data: { action, keyHash: fingerprint(action, key) } });
}

export async function clearRateLimit(action: string, key: string) {
  return prisma.rateLimitEvent.deleteMany({ where: { action, keyHash: fingerprint(action, key) } });
}
