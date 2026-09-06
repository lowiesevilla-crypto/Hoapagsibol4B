import type { Role, TenantModule } from "@prisma/client";

export const UX_ACTION_PROGRESS_FLAG = "ux_action_progress_v1";

type FlagTarget = {
  tenantId: string;
  module: TenantModule | string;
  role: Role | string;
};

type TargetRule = {
  enabled?: boolean;
  tenantId?: string;
  module?: string;
  roles?: string[];
};

type TargetConfig = {
  global?: boolean;
  tenantIds?: string[];
  modules?: string[];
  roles?: string[];
  rules?: TargetRule[];
};

type FlagEnvironment = {
  UX_ACTION_PROGRESS_V1_ENABLED?: string;
  UX_ACTION_PROGRESS_V1_TARGETS?: string;
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

/**
 * Visible action progress is safe presentation-layer feedback, so it is on by
 * default. Operations can still disable it immediately with the master switch.
 * Target configuration is honored only when the master switch is explicitly
 * enabled, which prevents stale rollout targets from hiding feedback when the
 * environment variable is absent.
 */
export function isUxActionProgressEnabled(target: FlagTarget, environment?: FlagEnvironment) {
  const source = environment ?? process.env;
  const master = source.UX_ACTION_PROGRESS_V1_ENABLED?.trim().toLowerCase() ?? "";

  if (!master) return true;
  if (FALSE_VALUES.has(master)) return false;
  if (!TRUE_VALUES.has(master)) return false;

  const rawTargets = source.UX_ACTION_PROGRESS_V1_TARGETS?.trim();
  if (!rawTargets) return true;

  const config = parseTargetConfig(rawTargets);
  if (!config) return false;

  for (const rule of [...(config.rules ?? [])].reverse()) {
    if (matchesRule(rule, target)) return rule.enabled !== false;
  }

  if (config.global === true) return true;

  const selectors = [config.tenantIds, config.modules, config.roles].filter((values): values is string[] => Array.isArray(values) && values.length > 0);
  if (selectors.length) {
    return matchesList(config.tenantIds, target.tenantId)
      && matchesList(config.modules, target.module)
      && matchesList(config.roles, target.role);
  }

  // A rule-only rollout must not spill over to unmatched tenants or roles.
  if (config.rules?.length) return false;

  return true;
}

function parseTargetConfig(value: string): TargetConfig | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as TargetConfig;
  } catch {
    return null;
  }
}

function matchesRule(rule: TargetRule, target: FlagTarget) {
  return (!rule.tenantId || rule.tenantId === "*" || rule.tenantId === target.tenantId)
    && (!rule.module || rule.module === "*" || rule.module === target.module)
    && matchesList(rule.roles, target.role);
}

function matchesList(values: string[] | undefined, actual: string) {
  return !values?.length || values.includes("*") || values.includes(actual);
}
