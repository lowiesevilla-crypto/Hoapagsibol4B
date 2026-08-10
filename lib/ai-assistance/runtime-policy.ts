import { AiRequestOutcome, Role } from "@prisma/client";
import { requireAiAssistanceEntitlement } from "@/lib/ai-assistance/entitlement";
import type { AiCommercialConfiguration } from "@/lib/ai-assistance/commercial";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";

export type AiExperience = "RESIDENT" | "STAFF";

export type AiGovernanceSnapshot = {
  runtimeEnabled: boolean;
  residentAssistantEnabled: boolean;
  staffCopilotEnabled: boolean;
  boardApprovedAt: Date | null;
  piaApprovedAt: Date | null;
  dpoApprovedAt: Date | null;
  providerApprovedAt: Date | null;
  crossBorderReviewApprovedAt: Date | null;
  privacyNoticeVersion: string | null;
  privacyNoticePublishedAt: Date | null;
  lawfulBasis: string | null;
  retentionDays: number;
};

export function evaluateAiGovernance(input: {
  globalRuntimeEnabled: boolean;
  commerciallyEnabled: boolean;
  experience: AiExperience;
  governance: AiGovernanceSnapshot | null;
}) {
  if (!input.globalRuntimeEnabled) return { allowed: false as const, reason: "GLOBAL_AI_KILL_SWITCH" };
  if (!input.commerciallyEnabled) return { allowed: false as const, reason: "AI_NOT_ENTITLED" };
  const governance = input.governance;
  if (!governance?.runtimeEnabled) return { allowed: false as const, reason: "TENANT_AI_DISABLED" };
  if (!governance.boardApprovedAt) return { allowed: false as const, reason: "BOARD_APPROVAL_REQUIRED" };
  if (!governance.piaApprovedAt) return { allowed: false as const, reason: "PIA_APPROVAL_REQUIRED" };
  if (!governance.dpoApprovedAt) return { allowed: false as const, reason: "DPO_APPROVAL_REQUIRED" };
  if (!governance.providerApprovedAt) return { allowed: false as const, reason: "PROVIDER_APPROVAL_REQUIRED" };
  if (!governance.crossBorderReviewApprovedAt) return { allowed: false as const, reason: "CROSS_BORDER_REVIEW_REQUIRED" };
  if (!governance.privacyNoticePublishedAt || !governance.privacyNoticeVersion) return { allowed: false as const, reason: "PRIVACY_NOTICE_REQUIRED" };
  if (!governance.lawfulBasis) return { allowed: false as const, reason: "LAWFUL_BASIS_REQUIRED" };
  if (!Number.isSafeInteger(governance.retentionDays) || governance.retentionDays < 1) return { allowed: false as const, reason: "RETENTION_POLICY_REQUIRED" };
  if (input.experience === "RESIDENT" && !governance.residentAssistantEnabled) return { allowed: false as const, reason: "RESIDENT_AI_DISABLED" };
  if (input.experience === "STAFF" && !governance.staffCopilotEnabled) return { allowed: false as const, reason: "STAFF_AI_DISABLED" };
  return { allowed: true as const, reason: null };
}

function monthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function configuredCostRates() {
  const input = Number(process.env.OPENAI_ESTIMATED_INPUT_CENTAVOS_PER_1K_TOKENS || "");
  const output = Number(process.env.OPENAI_ESTIMATED_OUTPUT_CENTAVOS_PER_1K_TOKENS || "");
  return {
    input: Number.isFinite(input) && input >= 0 ? input : null,
    output: Number.isFinite(output) && output >= 0 ? output : null,
  };
}

export function estimateAiCostCentavos(inputTokens: number, outputTokens: number) {
  const rates = configuredCostRates();
  if (rates.input == null || rates.output == null) return null;
  return Math.ceil((inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output);
}

async function assertAiCommercialUsageAvailable(tenantId: string, configuration: AiCommercialConfiguration, now = new Date()) {
  const [monthly, recentCount] = await Promise.all([
    prisma.aiUsageLedger.aggregate({
      where: {
        tenantId,
        createdAt: { gte: monthStart(now) },
        outcome: { in: [AiRequestOutcome.SUCCEEDED, AiRequestOutcome.PROVIDER_ERROR] },
      },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, estimatedCostCentavos: true },
    }),
    prisma.aiUsageLedger.count({
      where: {
        tenantId,
        createdAt: { gte: new Date(now.getTime() - 60_000) },
        outcome: { in: [AiRequestOutcome.SUCCEEDED, AiRequestOutcome.PROVIDER_ERROR] },
      },
    }),
  ]);

  if (recentCount >= configuration.requestsPerMinute) throw new Error("AI rate limit reached for this tenant. Please try again shortly.");
  if (configuration.monthlyRequestLimit != null && monthly._count._all >= configuration.monthlyRequestLimit) throw new Error("Monthly AI request allowance reached for this tenant.");
  if (configuration.monthlyInputTokenLimit != null && (monthly._sum.inputTokens ?? 0) >= configuration.monthlyInputTokenLimit) throw new Error("Monthly AI input-token allowance reached for this tenant.");
  if (configuration.monthlyOutputTokenLimit != null && (monthly._sum.outputTokens ?? 0) >= configuration.monthlyOutputTokenLimit) throw new Error("Monthly AI output-token allowance reached for this tenant.");
  if (configuration.monthlySpendLimitCentavos != null) {
    const rates = configuredCostRates();
    if (rates.input == null || rates.output == null) throw new Error("AI provider cost metering is not configured; spend-capped AI is fail-closed.");
    if ((monthly._sum.estimatedCostCentavos ?? 0) >= configuration.monthlySpendLimitCentavos) throw new Error("Monthly AI provider budget reached for this tenant.");
  }
}

export async function recordAiDeniedRequest(input: { tenantId: string; actorId: string; requestId: string; reason: string; outcome?: AiRequestOutcome }) {
  await prisma.aiUsageLedger.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      outcome: input.outcome ?? AiRequestOutcome.DENIED,
      denialReason: input.reason.slice(0, 255),
    },
  }).catch(() => undefined);
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      module: "AI_ASSISTANCE",
      action: "AI_ACCESS_DENIED",
      entityType: "AiRequest",
      entityId: input.requestId,
      metadata: { reason: input.reason },
    },
  }).catch(() => undefined);
}

export async function requireAiRuntimeAccess(experience: AiExperience) {
  const user = await requireUser();
  const permissionSet = new Set(user.permissions);
  if (!permissionSet.has(Permission.AI_ASSISTANCE_USE)) throw new Error("AI Assistance permission is required.");
  if (experience === "RESIDENT" && !user.roles.includes(Role.HOMEOWNER)) throw new Error("Resident AI is available only to an authenticated homeowner role.");
  if (experience === "STAFF" && user.roles.includes(Role.HOMEOWNER) && user.roles.length === 1) throw new Error("Staff AI requires an authorized staff or administrator role.");

  const entitlement = await requireAiAssistanceEntitlement(user.tenantId);
  const governance = await prisma.tenantAiConfiguration.findUnique({ where: { tenantId: user.tenantId } });
  const decision = evaluateAiGovernance({
    globalRuntimeEnabled: process.env.AI_RUNTIME_ENABLED === "true",
    commerciallyEnabled: entitlement.enabled,
    experience,
    governance,
  });
  if (!decision.allowed) throw new Error(`AI Assistance is unavailable: ${decision.reason}.`);
  await assertAiCommercialUsageAvailable(user.tenantId, entitlement.configuration);

  return { user, entitlement, governance };
}
