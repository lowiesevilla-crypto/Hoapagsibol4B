import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";

import { NextResponse } from "next/server";

import { buildCsv } from "@/lib/master-data";

export async function GET() {
  await requirePermission(Permission.DATA_MIGRATE);
  const headers = ["kind", "homeownerEmail", "contractorCompany", "period", "amount", "remarks", "referenceNumber", "relatedReceiptNumber", "allowDuplicate"];
  const csv = buildCsv(headers, [["DUES_OPENING_BALANCE", "homeowner@example.com", "", "2025-01-01", "500.00", "Opening balance from prior ledger", "", "", "false"]]);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="hoa-balance-migration-template.csv"' } });
}
