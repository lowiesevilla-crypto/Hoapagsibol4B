import { BillingGenerationMode, RecurringChargeType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await requirePermission(Permission.BILLING_GENERATE);
  const rule = await prisma.billingRule.findFirst({
    where: {
      tenantId: user.tenantId,
      recurringChargeType: RecurringChargeType.MONTHLY_DUES,
      active: true,
      generationMode: BillingGenerationMode.AUTOMATIC,
    },
    orderBy: [{ effectiveStartYear: "asc" }, { effectiveStartMonth: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      billingDay: true,
      effectiveStartYear: true,
      effectiveStartMonth: true,
    },
  });

  return NextResponse.json({
    automatic: Boolean(rule),
    billingDay: rule?.billingDay ?? null,
    ruleId: rule?.id ?? null,
    effectiveStartYear: rule?.effectiveStartYear ?? null,
    effectiveStartMonth: rule?.effectiveStartMonth ?? null,
  });
}
