import { BillingGenerationMode, RecurringChargeType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { findEffectiveBillingRule } from "@/lib/services/billing-rules";

export async function GET() {
  const user = await requirePermission(Permission.BILLING_GENERATE);
  const { year, month } = manilaPeriod(new Date());
  const rule = await findEffectiveBillingRule(user.tenantId, RecurringChargeType.MONTHLY_DUES, year, month);

  return NextResponse.json({
    automatic: rule?.generationMode === BillingGenerationMode.AUTOMATIC,
    billingDay: rule?.billingDay ?? null,
    ruleId: rule?.id ?? null,
    coverageYear: year,
    coverageMonth: month,
  });
}

function manilaPeriod(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return { year: part("year"), month: part("month") };
}
