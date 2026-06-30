import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildCsv } from "@/lib/master-data";

export async function GET() {
  await requireUser(Role.ADMIN);
  const headers = ["kind", "homeownerEmail", "contractorCompany", "period", "amount", "remarks", "referenceNumber", "relatedReceiptNumber", "allowDuplicate"];
  const csv = buildCsv(headers, [["DUES_OPENING_BALANCE", "homeowner@example.com", "", "2025-01-01", "500.00", "Opening balance from prior ledger", "", "", "false"]]);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="hoa-balance-migration-template.csv"' } });
}
