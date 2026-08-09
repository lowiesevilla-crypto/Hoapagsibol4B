import "server-only";

import { SystemSettingCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
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

  return {
    flow: normalizeHomeownerPaymentFlow(values.get(HOMEOWNER_PAYMENT_FLOW_KEY)),
    paymongoLinkedAccountId,
    paymongoWebhookId,
    paymongoWebhookSecretConfigured,
    paymongoServerConfigured,
    paymongoReady: Boolean(
      paymongoLinkedAccountId
      && paymongoServerConfigured
      && paymongoWebhookId
      && paymongoWebhookSecretConfigured,
    ),
  };
}
