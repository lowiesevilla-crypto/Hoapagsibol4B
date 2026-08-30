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

/**
 * Default-off, fail-closed rollout resolver. The master switch is an immediate
 * rollback control. Target lists are ANDed; explicit rules are evaluated from
 * last to first so a narrow tenant/module/role override can supersede global.
 */
export function isUxActionProgressEnabled(target: FlagTarget, environment?: FlagEnvironment) {
  const source = environment ?? process.env;
  if (source.UX_ACTION_PROGRESS_V1_ENABLED?.trim().toLowerCase() !== "true") return false;

  const config = parseTargetConfig(source.UX_ACTION_PROGRESS_V1_TARGETS);
  if (!config) return false;

  for (const rule of [...(config.rules ?? [])].reverse()) {
    if (matchesRule(rule, target)) return rule.enabled !== false;
  }

  if (config.global === true) return true;

  const selectors = [config.tenantIds, config.modules, config.roles].filter((values): values is string[] => Array.isArray(values) && values.length > 0);
  if (!selectors.length) return false;

  return matchesList(config.tenantIds, target.tenantId)
    && matchesList(config.modules, target.module)
    && matchesList(config.roles, target.role);
}

function parseTargetConfig(value: string | undefined): TargetConfig | null {
  if (!value) return null;
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
