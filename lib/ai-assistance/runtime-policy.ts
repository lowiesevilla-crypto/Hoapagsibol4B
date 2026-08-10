import { AiRequestOutcome, Role } from "@prisma/client";
import { requireAiAssistanceEntitlement } from "@/lib/ai-assistance/entitlement";
import type { AiCommercialConfiguration } from "@/lib/ai-assistance/commercial";
import { evaluateAiGovernance, type AiExperience } from "@/lib/ai-assistance/governance-policy";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";

export { evaluateAiGovernance } from "@/lib/ai-assistance/governance-policy";
export type { AiExperience, AiGovernanceSnapshot } from "@/lib/ai-assistance/governance-policy";

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
      metadata: { reason: input.reason.slice(0, 255) },
    },
  }).catch(() => undefined);
}

function quotaOutcome(message: string) {
  return /rate limit/i.test(message) ? AiRequestOutcome.RATE_LIMITED : AiRequestOutcome.QUOTA_BLOCKED;
}

export async function requireAiRuntimeAccess(experience: AiExperience, requestId?: string) {
  const user = await requireUser();
  const deny = async (reason: string, outcome: AiRequestOutcome = AiRequestOutcome.DENIED): Promise<never> => {
    if (requestId) await recordAiDeniedRequest({ tenantId: user.tenantId, actorId: user.id, requestId, reason, outcome });
    throw new Error(reason);
  };

  const permissionSet = new Set(user.permissions);
  if (!permissionSet.has(Permission.AI_ASSISTANCE_USE)) return deny("AI Assistance permission is required.");
  if (experience === "RESIDENT" && !user.roles.includes(Role.HOMEOWNER)) return deny("Resident AI is available only to an authenticated homeowner role.");
  if (experience === "STAFF" && user.roles.includes(Role.HOMEOWNER) && user.roles.length === 1) return deny("Staff AI requires an authorized staff or administrator role.");

  let entitlement: Awaited<ReturnType<typeof requireAiAssistanceEntitlement>>;
  try {
    entitlement = await requireAiAssistanceEntitlement(user.tenantId);
  } catch (error) {
    return deny(error instanceof Error ? error.message : "AI Assistance is not included in this tenant subscription.");
  }

  const governance = await prisma.tenantAiConfiguration.findUnique({ where: { tenantId: user.tenantId } });
  const decision = evaluateAiGovernance({
    globalRuntimeEnabled: process.env.AI_RUNTIME_ENABLED === "true",
    commerciallyEnabled: entitlement.enabled,
    experience,
    governance,
  });
  if (!decision.allowed) return deny(`AI Assistance is unavailable: ${decision.reason}.`);
  // evaluateAiGovernance can only return allowed=true when governance exists.
  if (!governance) return deny("AI Assistance is unavailable: TENANT_AI_DISABLED.");

  try {
    await assertAiCommercialUsageAvailable(user.tenantId, entitlement.configuration);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "AI usage limit reached for this tenant.";
    return deny(reason, quotaOutcome(reason));
  }

  return { user, entitlement, governance };
}
