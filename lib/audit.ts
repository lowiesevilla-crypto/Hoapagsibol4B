"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function writeAuditLog(input: {
  actorId?: string | null;
  module: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      module: input.module,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: toJson(input.metadata),
    },
  });
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
