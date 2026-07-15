import { PayrollStatus, Role } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePayrollAccess } from "@/lib/payroll-access";
import { getAssociationSettings } from "@/lib/system-settings";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const slip = await prisma.payslip.findUnique({
    where: { id },
    include: {
      employee: true,
      payroll: { include: { deductions: { where: {}, include: { deductionType: true, employeeLoan: true }, orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!slip) return new Response("Payslip not found.", { status: 404 });

  if (user.role === Role.EMPLOYEE) {
    if (!user.employeeProfile || slip.employeeId !== user.employeeProfile.id || slip.payroll.status !== PayrollStatus.PAID) {
      return new Response("Payslip not found.", { status: 404 });
    }
  } else if (user.role === Role.ADMIN || user.role === Role.SYSTEM_ADMIN) {
    await requirePayrollAccess();
  } else {
    return new Response("Forbidden.", { status: 403 });
  }

  const deductions = slip.payroll.deductions.filter((item) => item.employeeId === slip.employeeId);
  const association = await getAssociationSettings(user.tenantId);
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  document.setTitle(`Payslip ${slip.employee.employeeNumber} ${dateText(slip.payroll.payDate)}`);
  document.setAuthor(association.documentTitle);

  const page = document.addPage([595.28, 841.89]);
  drawHeader(page, association.name, bold, regular);
  let y = 690;
  y = drawInfo(page, y, "Employee", slip.employee.name, regular, bold);
  y = drawInfo(page, y, "Employee No.", slip.employee.employeeNumber, regular, bold);
  y = drawInfo(page, y, "Position", slip.employee.position, regular, bold);
  y = drawInfo(page, y, "Payroll Period", `${dateText(slip.payroll.startDate)} - ${dateText(slip.payroll.endDate)}`, regular, bold);
  y = drawInfo(page, y, "Payment Date", dateText(slip.payroll.payDate), regular, bold);
  y = drawInfo(page, y, "Payment Status", slip.payroll.status, regular, bold);

  y -= 18;
  page.drawText("EARNINGS", { x: 48, y, size: 12, font: bold, color: navy });
  page.drawText("DEDUCTIONS", { x: 315, y, size: 12, font: bold, color: navy });
  y -= 22;
  const earningsY = drawAmountRows(page, y, [
    [`Basic pay (${slip.payableDays} days)`, moneyPdf(slip.basicPay)],
    [`Overtime (${slip.overtimeHours} hrs)`, moneyPdf(slip.overtimePay)],
    ["Allowance", moneyPdf(slip.allowance)],
    ["Gross Pay", moneyPdf(slip.grossPay)],
  ], 48, regular, bold);

  const deductionRows = [
    ...(Number(slip.employee.fixedDeduction) > 0 ? [["Employee fixed deduction", moneyPdf(slip.employee.fixedDeduction)]] : []),
    ...deductions.map((deduction) => [deduction.employeeLoan ? `${deduction.deductionType.name} - ${deduction.employeeLoan.description}` : deduction.deductionType.name, moneyPdf(deduction.amount)]),
    ["Total Deductions", moneyPdf(slip.deduction)],
  ];
  const deductionsY = drawAmountRows(page, y, deductionRows.length ? deductionRows : [["No assigned deductions", moneyPdf(0)]], 315, regular, bold);

  y = Math.min(earningsY, deductionsY) - 35;
  page.drawRectangle({ x: 48, y: y - 20, width: 499, height: 45, borderColor: navy, borderWidth: 1.3, color: rgb(0.95, 0.98, 0.96) });
  page.drawText("NET PAY", { x: 65, y: y - 2, size: 14, font: bold, color: navy });
  page.drawText(moneyPdf(slip.netPay), { x: 430, y: y - 2, size: 14, font: bold, color: green });

  page.drawLine({ start: { x: 74, y: 120 }, end: { x: 230, y: 120 }, thickness: 0.8, color: gray });
  page.drawLine({ start: { x: 365, y: 120 }, end: { x: 521, y: 120 }, thickness: 0.8, color: gray });
  page.drawText("Employee signature", { x: 102, y: 103, size: 9, font: regular, color: gray });
  page.drawText("Authorized signature", { x: 398, y: 103, size: 9, font: regular, color: gray });

  const bytes = await document.save();
  const fileName = `payslip-${slip.employee.employeeNumber}-${dateText(slip.payroll.payDate).replaceAll(" ", "-")}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

const navy = rgb(0.04, 0.23, 0.34);
const green = rgb(0.31, 0.72, 0.19);
const gray = rgb(0.35, 0.42, 0.47);

function drawHeader(page: PDFPage, associationName: string, bold: PDFFont, regular: PDFFont) {
  page.drawRectangle({ x: 0, y: 748, width: 595.28, height: 93.89, color: navy });
  page.drawRectangle({ x: 0, y: 742, width: 595.28, height: 6, color: green });
  page.drawText(safeText(associationName), { x: 48, y: 798, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText("HOMEOWNERS ASSOCIATION", { x: 48, y: 777, size: 9, font: regular, color: rgb(0.78, 0.92, 0.98) });
  page.drawText("EMPLOYEE PAYSLIP", { x: 48, y: 716, size: 22, font: bold, color: navy });
}

function drawInfo(page: PDFPage, y: number, label: string, value: string, regular: PDFFont, bold: PDFFont) {
  page.drawText(label, { x: 48, y, size: 10, font: bold, color: gray });
  page.drawText(safeText(value), { x: 175, y, size: 10, font: regular, color: navy });
  return y - 20;
}

function drawAmountRows(page: PDFPage, startY: number, rows: string[][], x: number, regular: PDFFont, bold: PDFFont) {
  let y = startY;
  for (const [label, value] of rows) {
    const strong = label.toLowerCase().includes("gross") || label.toLowerCase().includes("total");
    page.drawText(safeText(label).slice(0, 34), { x, y, size: 9, font: strong ? bold : regular, color: navy });
    page.drawText(value, { x: x + 150, y, size: 9, font: strong ? bold : regular, color: navy });
    y -= 18;
  }
  return y;
}

function dateText(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function moneyPdf(value: number | string | { toString(): string }) {
  return `PHP ${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "");
}
