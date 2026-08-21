import "server-only";

import { SystemSettingCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  emptyTenantOnboardingState,
  onboardingPrerequisites,
  TENANT_ONBOARDING_VERSION,
  type TenantOnboardingState,
} from "@/lib/onboarding/policy";

export const TENANT_ONBOARDING_SETTING_KEY = "TENANT_ONBOARDING_V1";

type OnboardingStateTx = {
  systemSetting: {
    findFirst(args: {
      where: {
        tenantId: string;
        category: SystemSettingCategory;
        key: string;
      };
      select: { id: true; value: true };
    }): Promise<{ id: string; value: string | null } | null>;
    update(args: {
      where: { id: string };
      data: { value: string; updatedById: string };
    }): Promise<unknown>;
    create(args: {
      data: {
        tenantId: string;
        category: SystemSettingCategory;
        key: string;
        label: string;
        value: string;
        isSecret: boolean;
        updatedById: string;
      };
    }): Promise<unknown>;
  };
};

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
  tx?: OnboardingStateTx,
) {
  const setting = tx
    ? await tx.systemSetting.findFirst({
        where: {
          tenantId,
          category: SystemSettingCategory.ASSOCIATION,
          key: TENANT_ONBOARDING_SETTING_KEY,
        },
        select: { id: true, value: true },
      })
    : await prisma.systemSetting.findFirst({
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
    const args = {
      where: { id: setting.id },
      data: { value, updatedById: actorId },
    };
    if (tx) await tx.systemSetting.update(args);
    else await prisma.systemSetting.update(args);
  } else {
    const args = {
      data: {
        tenantId,
        category: SystemSettingCategory.ASSOCIATION,
        key: TENANT_ONBOARDING_SETTING_KEY,
        label: "Tenant onboarding progress",
        value,
        isSecret: false,
        updatedById: actorId,
      },
    };
    if (tx) await tx.systemSetting.create(args);
    else await prisma.systemSetting.create(args);
  }

  return next;
}
