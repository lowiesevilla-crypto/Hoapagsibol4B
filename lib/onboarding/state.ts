import "server-only";

import { SystemSettingCategory, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  emptyTenantOnboardingState,
  onboardingPrerequisites,
  TENANT_ONBOARDING_VERSION,
  type TenantOnboardingState,
} from "@/lib/onboarding/policy";

export const TENANT_ONBOARDING_SETTING_KEY = "TENANT_ONBOARDING_V1";

export {
  emptyTenantOnboardingState,
  onboardingPrerequisites,
  TENANT_ONBOARDING_VERSION,
};
export type { TenantOnboardingState };

export async function getTenantOnboardingState(tenantId: string) {
  const setting = await prisma.systemSetting.findFirst({
    where: {
      tenantId,
      category: SystemSettingCategory.ASSOCIATION,
      key: TENANT_ONBOARDING_SETTING_KEY,
    },
    select: { value: true },
  });
  if (!setting?.value) return emptyTenantOnboardingState();
  try {
    const parsed = JSON.parse(setting.value) as TenantOnboardingState;
    if (parsed.version !== TENANT_ONBOARDING_VERSION) return emptyTenantOnboardingState();
    return parsed;
  } catch {
    return emptyTenantOnboardingState();
  }
}

export async function updateTenantOnboardingState(
  tenantId: string,
  actorId: string,
  updater: (current: TenantOnboardingState) => TenantOnboardingState,
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? prisma;
  const setting = await db.systemSetting.findFirst({
    where: {
      tenantId,
      category: SystemSettingCategory.ASSOCIATION,
      key: TENANT_ONBOARDING_SETTING_KEY,
    },
    select: { id: true, value: true },
  });
  let current = emptyTenantOnboardingState();
  if (setting?.value) {
    try {
      const parsed = JSON.parse(setting.value) as TenantOnboardingState;
      if (parsed.version === TENANT_ONBOARDING_VERSION) current = parsed;
    } catch {
      current = emptyTenantOnboardingState();
    }
  }
  const next: TenantOnboardingState = {
    ...updater(current),
    version: TENANT_ONBOARDING_VERSION,
    updatedAt: new Date().toISOString(),
  };
  const value = JSON.stringify(next);
  if (setting) {
    await db.systemSetting.update({
      where: { id: setting.id },
      data: { value, updatedById: actorId },
    });
  } else {
    await db.systemSetting.create({
      data: {
        tenantId,
        category: SystemSettingCategory.ASSOCIATION,
        key: TENANT_ONBOARDING_SETTING_KEY,
        label: "Tenant onboarding progress",
        value,
        isSecret: false,
        updatedById: actorId,
      },
    });
  }
  return next;
}
