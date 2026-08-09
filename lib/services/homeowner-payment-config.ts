import "server-only";

import { SystemSettingCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  HOMEOWNER_PLATFORM_FEE_AMOUNT_CENTAVOS_KEY,
  HOMEOWNER_PLATFORM_FEE_ENABLED_KEY,
  PAYMONGO_HOMEOWNER_PARENT_ACCOUNT_ENV,
  normalizePlatformFeeCentavos,
  settingEnabled,
} from "@/lib/homeowner-convenience-fee";
import { normalizeHomeownerPaymentFlow } from "@/lib/homeowner-payment-flow";
import { withTenantContext } from "@/lib/tenant-context";

export const HOMEOWNER_PAYMENT_FLOW_KEY = "HOMEOWNER_PAYMENT_FLOW";
export const PAYMONGO_LINKED_ACCOUNT_ID_KEY = "PAYMONGO_LINKED_ACCOUNT_ID";
export const PAYMONGO_WEBHOOK_ID_KEY_PREFIX = "PAYMONGO_WEBHOOK_ID:";
export const PAYMONGO_WEBHOOK_SECRET_KEY_PREFIX = "PAYMONGO_WEBHOOK_SECRET:";

export function paymongoWebhookIdSettingKey(accountId: string) {
  return `${PAYMONGO_WEBHOOK_ID_KEY_PREFIX}${accountId}`;
}

export function paymongoWebhookSecretSettingKey(accountId: string) {
  return `${PAYMONGO_WEBHOOK_SECRET_KEY_PREFIX}${accountId}`;
}

export async function getHomeownerPaymentConfig(tenantId: string) {
  const settings = await withTenantContext(tenantId, async () => prisma.systemSetting.findMany({
    where: {
      tenantId,
      category: SystemSettingCategory.PAYMENT,
    },
    select: { key: true, value: true },
  }));
  const values = new Map(settings.map((setting) => [setting.key, setting.value?.trim() || ""]));
  const paymongoLinkedAccountId = values.get(PAYMONGO_LINKED_ACCOUNT_ID_KEY) || "";
  const paymongoWebhookId = paymongoLinkedAccountId ? values.get(paymongoWebhookIdSettingKey(paymongoLinkedAccountId)) || "" : "";
  const paymongoWebhookSecretConfigured = Boolean(
    paymongoLinkedAccountId
    && values.get(paymongoWebhookSecretSettingKey(paymongoLinkedAccountId)),
  );
  const paymongoServerConfigured = Boolean(process.env.PAYMONGO_HOMEOWNER_SECRET_KEY?.trim());
  const paymongoParentAccountId = process.env[PAYMONGO_HOMEOWNER_PARENT_ACCOUNT_ENV]?.trim() || "";
  const platformFeeConfigured = settingEnabled(values.get(HOMEOWNER_PLATFORM_FEE_ENABLED_KEY));
  const platformFeeAmountCentavos = normalizePlatformFeeCentavos(values.get(HOMEOWNER_PLATFORM_FEE_AMOUNT_CENTAVOS_KEY));
  const platformFeeEnabled = platformFeeConfigured && platformFeeAmountCentavos > 0;
  const platformFeeRoutingReady = Boolean(!platformFeeEnabled || paymongoParentAccountId.startsWith("org_"));

  return {
    flow: normalizeHomeownerPaymentFlow(values.get(HOMEOWNER_PAYMENT_FLOW_KEY)),
    paymongoLinkedAccountId,
    paymongoWebhookId,
    paymongoWebhookSecretConfigured,
    paymongoServerConfigured,
    paymongoParentAccountIdConfigured: paymongoParentAccountId.startsWith("org_"),
    platformFeeEnabled,
    platformFeeAmountCentavos,
    platformFeeAmountPesos: platformFeeAmountCentavos / 100,
    platformFeeRoutingReady,
    paymongoReady: Boolean(
      paymongoLinkedAccountId
      && paymongoServerConfigured
      && paymongoWebhookId
      && paymongoWebhookSecretConfigured
      && platformFeeRoutingReady,
    ),
  };
}
