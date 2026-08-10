export const AI_ASSISTANCE_FEATURE_CODE = "AI_ASSISTANCE" as const;

export type AiModelTier = "ECONOMY" | "STANDARD" | "PREMIUM";
export type AiOveragePolicy = "HARD_STOP" | "APPROVAL_REQUIRED";

export type AiCommercialConfiguration = {
  monthlyRequestLimit: number | null;
  monthlyInputTokenLimit: number | null;
  monthlyOutputTokenLimit: number | null;
  monthlySpendLimitCentavos: number | null;
  requestsPerMinute: number;
  knowledgeIndexMb: number | null;
  modelTier: AiModelTier;
  overagePolicy: AiOveragePolicy;
};

export const DEFAULT_AI_COMMERCIAL_CONFIGURATION: AiCommercialConfiguration = {
  monthlyRequestLimit: 1_000,
  monthlyInputTokenLimit: null,
  monthlyOutputTokenLimit: null,
  monthlySpendLimitCentavos: null,
  requestsPerMinute: 10,
  knowledgeIndexMb: null,
  modelTier: "STANDARD",
  overagePolicy: "HARD_STOP",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalNonNegativeInteger(value: unknown, fallback: number | null) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return fallback;
  return value;
}

function positiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return fallback;
  return value;
}

export function parseAiCommercialConfiguration(value: unknown): AiCommercialConfiguration {
  const source = record(value);
  const modelTier = source.modelTier === "ECONOMY" || source.modelTier === "PREMIUM" || source.modelTier === "STANDARD"
    ? source.modelTier
    : DEFAULT_AI_COMMERCIAL_CONFIGURATION.modelTier;
  const overagePolicy = source.overagePolicy === "APPROVAL_REQUIRED" || source.overagePolicy === "HARD_STOP"
    ? source.overagePolicy
    : DEFAULT_AI_COMMERCIAL_CONFIGURATION.overagePolicy;

  return {
    monthlyRequestLimit: optionalNonNegativeInteger(source.monthlyRequestLimit, DEFAULT_AI_COMMERCIAL_CONFIGURATION.monthlyRequestLimit),
    monthlyInputTokenLimit: optionalNonNegativeInteger(source.monthlyInputTokenLimit, DEFAULT_AI_COMMERCIAL_CONFIGURATION.monthlyInputTokenLimit),
    monthlyOutputTokenLimit: optionalNonNegativeInteger(source.monthlyOutputTokenLimit, DEFAULT_AI_COMMERCIAL_CONFIGURATION.monthlyOutputTokenLimit),
    monthlySpendLimitCentavos: optionalNonNegativeInteger(source.monthlySpendLimitCentavos, DEFAULT_AI_COMMERCIAL_CONFIGURATION.monthlySpendLimitCentavos),
    requestsPerMinute: positiveInteger(source.requestsPerMinute, DEFAULT_AI_COMMERCIAL_CONFIGURATION.requestsPerMinute),
    knowledgeIndexMb: optionalNonNegativeInteger(source.knowledgeIndexMb, DEFAULT_AI_COMMERCIAL_CONFIGURATION.knowledgeIndexMb),
    modelTier,
    overagePolicy,
  };
}

export function mergeAiCommercialConfiguration(planValue: unknown, tenantOverrideValue?: unknown): AiCommercialConfiguration {
  const plan = parseAiCommercialConfiguration(planValue);
  const override = record(tenantOverrideValue);
  return parseAiCommercialConfiguration({ ...plan, ...override });
}
