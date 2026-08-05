"use server";

import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";
import { AttendanceStatus, ContractorStatus, EmployeeStatus, HomeownerStatus, Role, SalaryType, VehicleStatus } from "@prisma/client";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { masterDataTemplates, type MasterDataType } from "@/lib/master-data";

export type BulkImportState = { success: boolean; message: string; imported: number; errors: string[] };

const emptyState: BulkImportState = { success: false, message: "", imported: 0, errors: [] };

export async function importMasterDataAction(_state: BulkImportState = emptyState, formData: FormData): Promise<BulkImportState> {
  await requirePermission(Permission.DATA_IMPORT);
  const type = String(formData.get("type") || "") as MasterDataType;
  const file = formData.get("file");
  if (!isMasterDataType(type)) return { ...emptyState, message: "Choose a valid master data type.", errors: ["Invalid master data type."] };
  if (!isUploadedCsvFile(file) || !file.size) return { ...emptyState, message: "Upload a CSV file.", errors: ["CSV file is required."] };

  const csv = await file.text();
  const parsed = parseCsv(csv);
  const template = masterDataTemplates[type];
  const headerErrors = template.filter((column) => !parsed.headers.includes(column)).map((column) => `Missing required column: ${column}`);
  if (headerErrors.length) return { ...emptyState, message: "Template validation failed.", errors: headerErrors };
  if (!parsed.rows.length) return { ...emptyState, message: "No records found.", errors: ["CSV file does not contain data rows."] };

  const rows = parsed.rows.map((row, index) => ({ rowNumber: index + 2, data: row }));
  const errors = await validateRows(type, rows);
  if (errors.length) return { ...emptyState, message: "Upload has validation errors. No records were imported.", errors };

  const imported = await importRows(type, rows);
  revalidatePath("/admin/data");
  revalidatePath(`/admin/${type === "attendance" ? "attendance" : type}`);
  return { success: true, message: `${imported} ${type} record${imported === 1 ? "" : "s"} imported successfully.`, imported, errors: [] };
}

async function validateRows(type: MasterDataType, rows: Array<{ rowNumber: number; data: Record<string, string> }>) {
  const errors: string[] = [];
  const seen = new Set<string>();
  const optionalFields: Record<MasterDataType, string[]> = {
    homeowners: ["messengerId"],
    contractors: ["email", "licenseNumber"],
    vehicles: ["expiresAt", "remarks"],
    employees: ["email"],
    attendance: ["timeIn", "timeOut", "remarks"],
  };
  const required = masterDataTemplates[type].filter((column) => !optionalFields[type].includes(column));

  for (const row of rows) {
    for (const field of required) if (!value(row.data, field)) errors.push(rowError(row.rowNumber, field, "Required."));
    if (value(row.data, "email") && !isEmail(value(row.data, "email"))) errors.push(rowError(row.rowNumber, "email", "Invalid email."));
    if (value(row.data, "homeownerEmail") && !isEmail(value(row.data, "homeownerEmail"))) errors.push(rowError(row.rowNumber, "homeownerEmail", "Invalid email."));
    for (const field of ["issuedAt", "hireDate", "date"]) if (value(row.data, field) && !isDate(value(row.data, field))) errors.push(rowError(row.rowNumber, field, "Use YYYY-MM-DD format."));
    for (const field of ["monthlyDuesAmount", "baseRate", "standardWorkDays", "fixedAllowance", "fixedDeduction", "overtimeHours"]) if (value(row.data, field) && !isFiniteNumber(value(row.data, field))) errors.push(rowError(row.rowNumber, field, "Must be a valid number."));
    if (type === "homeowners" && !enumValue(HomeownerStatus, value(row.data, "status"))) errors.push(rowError(row.rowNumber, "status", "Use ACTIVE or INACTIVE."));
    if (type === "contractors" && !enumValue(ContractorStatus, value(row.data, "status"))) errors.push(rowError(row.rowNumber, "status", "Use ACTIVE or INACTIVE."));
    if (type === "vehicles" && !enumValue(VehicleStatus, value(row.data, "status"))) errors.push(rowError(row.rowNumber, "status", "Use ACTIVE, INACTIVE, or EXPIRED."));
    if (type === "employees" && !enumValue(EmployeeStatus, value(row.data, "status"))) errors.push(rowError(row.rowNumber, "status", "Use ACTIVE or INACTIVE."));
    if (type === "employees" && !enumValue(SalaryType, value(row.data, "salaryType"))) errors.push(rowError(row.rowNumber, "salaryType", "Use DAILY or MONTHLY."));
    if (type === "attendance" && !enumValue(AttendanceStatus, value(row.data, "status"))) errors.push(rowError(row.rowNumber, "status", "Use a valid attendance status."));
    const key = naturalKey(type, row.data);
    if (key && seen.has(key)) errors.push(`Row ${row.rowNumber}: Duplicate record inside upload (${key}).`);
    if (key) seen.add(key);
  }
  if (errors.length) return errors;

  if (type === "homeowners") {
    const emails = rows.map((row) => value(row.data, "email").toLowerCase());
    const blocksLots = rows.map((row) => ({ block: value(row.data, "block"), lot: value(row.data, "lot") }));
    const [users, profiles] = await Promise.all([
      prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } }),
      prisma.homeownerProfile.findMany({ where: { OR: blocksLots }, select: { block: true, lot: true } }),
    ]);
    for (const user of users) errors.push(`Duplicate homeowner email already exists: ${user.email}`);
    for (const profile of profiles) errors.push(`Duplicate homeowner property already exists: Block ${profile.block}, Lot ${profile.lot}`);
  }
  if (type === "contractors") {
    const names = rows.map((row) => value(row.data, "companyName"));
    const existing = await prisma.contractorProfile.findMany({ where: { companyName: { in: names } }, select: { companyName: true } });
    for (const item of existing) errors.push(`Duplicate contractor company already exists: ${item.companyName}`);
  }
  if (type === "vehicles") {
    const emails = rows.map((row) => value(row.data, "homeownerEmail").toLowerCase());
    const plates = rows.map((row) => value(row.data, "plateNumber").toUpperCase());
    const stickers = rows.map((row) => value(row.data, "stickerNumber").toUpperCase());
    const [homeowners, vehicles] = await Promise.all([
      prisma.homeownerProfile.findMany({ where: { user: { email: { in: emails } } }, include: { user: true } }),
      prisma.vehicle.findMany({ where: { OR: [{ plateNumber: { in: plates } }, { stickerNumber: { in: stickers } }] }, select: { plateNumber: true, stickerNumber: true } }),
    ]);
    const homeownerEmails = new Set(homeowners.map((item) => item.user.email));
    for (const email of emails) if (!homeownerEmails.has(email)) errors.push(`Vehicle homeowner not found: ${email}`);
    for (const item of vehicles) errors.push(`Duplicate vehicle plate/sticker exists: ${item.plateNumber} / ${item.stickerNumber}`);
  }
  if (type === "employees") {
    const numbers = rows.map((row) => value(row.data, "employeeNumber"));
    const existing = await prisma.employeeProfile.findMany({ where: { employeeNumber: { in: numbers } }, select: { employeeNumber: true } });
    for (const item of existing) errors.push(`Duplicate employee number already exists: ${item.employeeNumber}`);
  }
  if (type === "attendance") {
    const numbers = rows.map((row) => value(row.data, "employeeNumber"));
    const employees = await prisma.employeeProfile.findMany({ where: { employeeNumber: { in: numbers } }, select: { id: true, employeeNumber: true } });
    const byNumber = new Map(employees.map((employee) => [employee.employeeNumber, employee.id]));
    for (const row of rows) if (!byNumber.has(value(row.data, "employeeNumber"))) errors.push(rowError(row.rowNumber, "employeeNumber", "Employee not found."));
    const existing = await prisma.attendance.findMany({
      where: { OR: rows.map((row) => ({ employeeId: byNumber.get(value(row.data, "employeeNumber")) || "__missing__", date: toDate(value(row.data, "date")) })) },
      include: { employee: true },
    });
    for (const item of existing) errors.push(`Attendance already exists for ${item.employee.employeeNumber} on ${item.date.toISOString().slice(0, 10)}`);
  }
  return errors;
}

async function importRows(type: MasterDataType, rows: Array<{ rowNumber: number; data: Record<string, string> }>) {
  if (type === "homeowners") {
    for (const row of rows) {
      await prisma.user.create({ data: { name: value(row.data, "name"), email: value(row.data, "email").toLowerCase(), passwordHash: await hash(value(row.data, "password"), 12), role: Role.HOMEOWNER, homeownerProfile: { create: { phone: value(row.data, "phone"), address: value(row.data, "address"), block: value(row.data, "block"), lot: value(row.data, "lot"), messengerId: nullable(row.data, "messengerId"), status: value(row.data, "status") as HomeownerStatus, monthlyDuesAmount: numberValue(row.data, "monthlyDuesAmount") } } } });
    }
  } else if (type === "contractors") {
    await prisma.contractorProfile.createMany({ data: rows.map((row) => ({ companyName: value(row.data, "companyName"), contactPerson: value(row.data, "contactPerson"), email: nullable(row.data, "email"), phone: value(row.data, "phone"), address: value(row.data, "address"), licenseNumber: nullable(row.data, "licenseNumber"), status: value(row.data, "status") as ContractorStatus })) });
  } else if (type === "vehicles") {
    const homeowners = await prisma.homeownerProfile.findMany({ where: { user: { email: { in: rows.map((row) => value(row.data, "homeownerEmail").toLowerCase()) } } }, include: { user: true } });
    const byEmail = new Map(homeowners.map((item) => [item.user.email, item.id]));
    await prisma.vehicle.createMany({ data: rows.map((row) => ({ homeownerId: byEmail.get(value(row.data, "homeownerEmail").toLowerCase())!, plateNumber: value(row.data, "plateNumber").toUpperCase(), vehicleType: value(row.data, "vehicleType"), make: value(row.data, "make"), model: value(row.data, "model"), color: value(row.data, "color"), stickerNumber: value(row.data, "stickerNumber").toUpperCase(), issuedAt: toDate(value(row.data, "issuedAt")), expiresAt: value(row.data, "expiresAt") ? toDate(value(row.data, "expiresAt")) : null, status: value(row.data, "status") as VehicleStatus, remarks: nullable(row.data, "remarks") })) });
  } else if (type === "employees") {
    await prisma.employeeProfile.createMany({ data: rows.map((row) => ({ employeeNumber: value(row.data, "employeeNumber"), name: value(row.data, "name"), position: value(row.data, "position"), email: nullable(row.data, "email"), phone: value(row.data, "phone"), address: value(row.data, "address"), hireDate: toDate(value(row.data, "hireDate")), salaryType: value(row.data, "salaryType") as SalaryType, baseRate: numberValue(row.data, "baseRate"), standardWorkDays: Number(value(row.data, "standardWorkDays")), fixedAllowance: numberValue(row.data, "fixedAllowance"), fixedDeduction: numberValue(row.data, "fixedDeduction"), status: value(row.data, "status") as EmployeeStatus })) });
  } else {
    const employees = await prisma.employeeProfile.findMany({ where: { employeeNumber: { in: rows.map((row) => value(row.data, "employeeNumber")) } }, select: { id: true, employeeNumber: true } });
    const byNumber = new Map(employees.map((item) => [item.employeeNumber, item.id]));
    await prisma.attendance.createMany({ data: rows.map((row) => ({ employeeId: byNumber.get(value(row.data, "employeeNumber"))!, date: toDate(value(row.data, "date")), timeIn: nullable(row.data, "timeIn"), timeOut: nullable(row.data, "timeOut"), status: value(row.data, "status") as AttendanceStatus, overtimeHours: numberValue(row.data, "overtimeHours"), remarks: nullable(row.data, "remarks") })) });
  }
  return rows.length;
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quote = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    const next = input[index + 1];
    if (quote && char === "\"" && next === "\"") { cell += "\""; index++; continue; }
    if (char === "\"") { quote = !quote; continue; }
    if (!quote && char === ",") { row.push(cell.trim()); cell = ""; continue; }
    if (!quote && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = (rows.shift() ?? []).map((item) => item.trim());
  return { headers, rows: rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))) };
}

function naturalKey(type: MasterDataType, row: Record<string, string>) {
  if (type === "homeowners") return `${value(row, "email").toLowerCase()}|${value(row, "block")}|${value(row, "lot")}`;
  if (type === "contractors") return value(row, "companyName").toLowerCase();
  if (type === "vehicles") return `${value(row, "plateNumber").toUpperCase()}|${value(row, "stickerNumber").toUpperCase()}`;
  if (type === "employees") return value(row, "employeeNumber").toLowerCase();
  return `${value(row, "employeeNumber").toLowerCase()}|${value(row, "date")}`;
}

function isMasterDataType(type: string): type is MasterDataType { return type in masterDataTemplates; }
function isUploadedCsvFile(file: FormDataEntryValue | null): file is FormDataEntryValue & { size: number; text(): Promise<string> } {
  return typeof file === "object" && file !== null && "size" in file && typeof file.size === "number" && "text" in file && typeof file.text === "function";
}
function value(row: Record<string, string>, field: string) { return String(row[field] ?? "").trim(); }
function nullable(row: Record<string, string>, field: string) { return value(row, field) || null; }
function numberValue(row: Record<string, string>, field: string) { return Number(value(row, field) || 0); }
function isEmail(input: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input); }
function isDate(input: string) { return /^\d{4}-\d{2}-\d{2}$/.test(input) && !Number.isNaN(toDate(input).valueOf()); }
function isFiniteNumber(input: string) { return Number.isFinite(Number(input)); }
function enumValue<T extends Record<string, string>>(values: T, input: string) { return Object.values(values).includes(input as T[keyof T]); }
function toDate(input: string) { return new Date(`${input}T00:00:00.000Z`); }
function rowError(row: number, field: string, message: string) { return `Row ${row}, ${field}: ${message}`; }
