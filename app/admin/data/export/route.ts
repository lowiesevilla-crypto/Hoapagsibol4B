import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";

import { prisma } from "@/lib/db";
import { buildCsv, masterDataTemplates, type MasterDataType } from "@/lib/master-data";

export async function GET(request: Request) {
  await requirePermission(Permission.DATA_EXPORT);
  const type = new URL(request.url).searchParams.get("type") as MasterDataType;
  if (!type || !(type in masterDataTemplates)) return new Response("Invalid export type.", { status: 400 });
  const rows = await exportRows(type);
  return new Response(buildCsv(masterDataTemplates[type], rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="export-${type}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}

async function exportRows(type: MasterDataType) {
  if (type === "homeowners") {
    const rows = await prisma.homeownerProfile.findMany({ include: { user: true }, orderBy: { user: { name: "asc" } } });
    return rows.map((item) => [item.user.name, item.user.email, "", item.phone, item.address, item.block, item.lot, item.messengerId ?? "", item.status, item.monthlyDuesAmount]);
  }
  if (type === "contractors") {
    const rows = await prisma.contractorProfile.findMany({ orderBy: { companyName: "asc" } });
    return rows.map((item) => [item.companyName, item.contactPerson, item.email ?? "", item.phone, item.address, item.licenseNumber ?? "", item.status]);
  }
  if (type === "vehicles") {
    const rows = await prisma.vehicle.findMany({ include: { homeowner: { include: { user: true } } }, orderBy: { plateNumber: "asc" } });
    return rows.map((item) => [item.homeowner.user.email, item.plateNumber, item.vehicleType, item.make, item.model, item.color, item.stickerNumber, dateText(item.issuedAt), item.expiresAt ? dateText(item.expiresAt) : "", item.status, item.remarks ?? ""]);
  }
  if (type === "employees") {
    const rows = await prisma.employeeProfile.findMany({ orderBy: { employeeNumber: "asc" } });
    return rows.map((item) => [item.employeeNumber, item.name, item.position, item.email ?? "", item.phone, item.address, dateText(item.hireDate), item.salaryType, item.baseRate, item.standardWorkDays, item.fixedAllowance, item.fixedDeduction, item.status]);
  }
  const rows = await prisma.attendance.findMany({ include: { employee: true }, orderBy: [{ date: "desc" }, { employee: { employeeNumber: "asc" } }] });
  return rows.map((item) => [item.employee.employeeNumber, dateText(item.date), item.timeIn ?? "", item.timeOut ?? "", item.status, item.overtimeHours, item.remarks ?? ""]);
}

function dateText(date: Date) {
  return date.toISOString().slice(0, 10);
}
