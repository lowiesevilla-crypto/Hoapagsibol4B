import "server-only";

import { SystemSettingCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeHomeownerPaymentFlow } from "@/lib/homeowner-payment-flow";
import { withTenantContext } from "@/lib/tenant-context";

export const HOMEOWNER_PAYMENT_FLOW_KEY = "HOMEOWNER_PAYMENT_FLOW";
export const PAYMONGO_LINKED_ACCOUNT_ID_KEY = "PAYMONGO_LINKED_ACCOUNT_ID";

export async function getHomeownerPaymentConfig(tenantId: string) {
  const settings = await withTenantContext(tenantId, async () => prisma.systemSetting.findMany({
    where: {
      tenantId,
      category: SystemSettingCategory.PAYMENT,
      key: { in: [HOMEOWNER_PAYMENT_FLOW_KEY, PAYMONGO_LINKED_ACCOUNT_ID_KEY] },
    },
    select: { key: true, value: true },
  }));
  const values = new Map(settings.map((setting) => [setting.key, setting.value?.trim() || ""]));
  return {
    flow: normalizeHomeownerPaymentFlow(values.get(HOMEOWNER_PAYMENT_FLOW_KEY)),
    paymongoLinkedAccountId: values.get(PAYMONGO_LINKED_ACCOUNT_ID_KEY) || "",
    paymongoServerConfigured: Boolean(
      process.env.PAYMONGO_HOMEOWNER_SECRET_KEY?.trim()
      && process.env.PAYMONGO_HOMEOWNER_WEBHOOK_SECRET?.trim(),
    ),
  };
}
