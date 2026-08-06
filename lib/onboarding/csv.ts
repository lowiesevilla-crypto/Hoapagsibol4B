import { createHash } from "node:crypto";
import { HomeownerStatus } from "@prisma/client";
import { HOMEOWNER_ACCOUNT_NUMBER_PATTERN } from "@/lib/services/homeowner-account-number";

export const ONBOARDING_HOMEOWNER_TEMPLATE_VERSION = "2.0";
export const ONBOARDING_HOMEOWNER_COLUMNS = [
  "name",
  "email",
  "phone",
  "address",
  "block",
  "lot",
  "phase",
  "propertyType",
  "occupancyStatus",
  "status",
  "monthlyDuesAmount",
  "accountNumber",
  "openingBalance",
  "openingBalanceAsOf",
] as const;

export type OnboardingHomeownerRow = {
  rowNumber: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  block: string;
  lot: string;
  phase: string | null;
  propertyType: string | null;
  occupancyStatus: string | null;
  status: HomeownerStatus;
  monthlyDuesAmount: number;
  accountNumber: string | null;
  openingBalance: number;
  openingBalanceAsOf: Date | null;
};

export type OnboardingImportError = {
  rowNumber: number | null;
  field: string | null;
  message: string;
};

export type ParsedOnboardingCsv = {
  templateVersion: typeof ONBOARDING_HOMEOWNER_TEMPLATE_VERSION;
  fileHash: string;
  headers: string[];
  rows: OnboardingHomeownerRow[];
  errors: OnboardingImportError[];
};

export function onboardingHomeownerTemplateCsv() {
  return [
    ONBOARDING_HOMEOWNER_COLUMNS.join(","),
    [
      "Juan Dela Cruz",
      "juan@example.com",
      "09171234567",
      "123 Sampaguita Street",
      "4",
      "12",
      "Phase 1",
      "HOUSE_AND_LOT",
      "OWNER_OCCUPIED",
      "ACTIVE",
      "500.00",
      "",
      "0.00",
      "",
    ].map(csvCell).join(","),
  ].join("\n");
}

export function onboardingErrorCsv(errors: OnboardingImportError[]) {
  const rows = [["row", "field", "message"], ...errors.map((error) => [error.rowNumber?.toString() ?? "", error.field ?? "", error.message])];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function parseOnboardingHomeownerCsv(input: string): ParsedOnboardingCsv {
  const normalized = input.replace(/^\uFEFF/, "");
  const fileHash = createHash("sha256").update(normalized).digest("hex");
  const matrix = parseCsvMatrix(normalized);
  const headers = (matrix.shift() ?? []).map((header) => header.trim());
  const errors: OnboardingImportError[] = [];
  const missing = ONBOARDING_HOMEOWNER_COLUMNS.filter((column) => !headers.includes(column));
  for (const column of missing) errors.push({ rowNumber: null, field: column, message: `Missing required column: ${column}.` });
  if (!matrix.length) errors.push({ rowNumber: null, field: null, message: "CSV file does not contain data rows." });
  if (matrix.length > 500) errors.push({ rowNumber: null, field: null, message: "A single onboarding import is limited to 500 homeowner rows." });
  if (errors.length) return { templateVersion: ONBOARDING_HOMEOWNER_TEMPLATE_VERSION, fileHash, headers, rows: [], errors };

  const parsedRows: OnboardingHomeownerRow[] = [];
  const seenEmails = new Set<string>();
  const seenProperties = new Set<string>();
  const seenAccounts = new Set<string>();

  matrix.forEach((cells, index) => {
    const rowNumber = index + 2;
    const raw = Object.fromEntries(headers.map((header, cellIndex) => [header, String(cells[cellIndex] ?? "").trim()]));
    const rowErrors: OnboardingImportError[] = [];
    const required = ["name", "phone", "address", "block", "lot", "status", "monthlyDuesAmount"];
    for (const field of required) if (!raw[field]) rowErrors.push({ rowNumber, field, message: "Required." });

    const email = raw.email?.toLowerCase() ?? "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowErrors.push({ rowNumber, field: "email", message: "Invalid email address." });
    if (email && seenEmails.has(email)) rowErrors.push({ rowNumber, field: "email", message: "Duplicate email inside this file." });
    if (email) seenEmails.add(email);

    const propertyKey = `${(raw.block ?? "").toLowerCase()}|${(raw.lot ?? "").toLowerCase()}`;
    if (raw.block && raw.lot && seenProperties.has(propertyKey)) rowErrors.push({ rowNumber, field: "block/lot", message: "Duplicate property inside this file." });
    if (raw.block && raw.lot) seenProperties.add(propertyKey);

    const status = raw.status as HomeownerStatus;
    if (raw.status && !Object.values(HomeownerStatus).includes(status)) rowErrors.push({ rowNumber, field: "status", message: "Use ACTIVE or INACTIVE." });

    const monthlyDuesAmount = parseMoney(raw.monthlyDuesAmount);
    if (monthlyDuesAmount === null || monthlyDuesAmount < 0) rowErrors.push({ rowNumber, field: "monthlyDuesAmount", message: "Use a non-negative amount with at most two decimal places." });

    const openingBalance = raw.openingBalance ? parseMoney(raw.openingBalance) : 0;
    if (openingBalance === null || openingBalance < 0) rowErrors.push({ rowNumber, field: "openingBalance", message: "Use a non-negative amount with at most two decimal places." });

    const openingBalanceAsOf = raw.openingBalanceAsOf ? parseDate(raw.openingBalanceAsOf) : null;
    if (raw.openingBalanceAsOf && !openingBalanceAsOf) rowErrors.push({ rowNumber, field: "openingBalanceAsOf", message: "Use YYYY-MM-DD format." });
    if ((openingBalance ?? 0) > 0 && !openingBalanceAsOf) rowErrors.push({ rowNumber, field: "openingBalanceAsOf", message: "Required when openingBalance is greater than zero." });

    const accountNumber = raw.accountNumber || null;
    if (accountNumber && !HOMEOWNER_ACCOUNT_NUMBER_PATTERN.test(accountNumber)) rowErrors.push({ rowNumber, field: "accountNumber", message: "Use an 11-digit account number that does not start with zero, or leave blank for automatic allocation." });
    if (accountNumber && seenAccounts.has(accountNumber)) rowErrors.push({ rowNumber, field: "accountNumber", message: "Duplicate account number inside this file." });
    if (accountNumber) seenAccounts.add(accountNumber);

    errors.push(...rowErrors);
    if (!rowErrors.length) {
      parsedRows.push({
        rowNumber,
        name: raw.name,
        email,
        phone: raw.phone,
        address: raw.address,
        block: raw.block,
        lot: raw.lot,
        phase: raw.phase || null,
        propertyType: raw.propertyType || null,
        occupancyStatus: raw.occupancyStatus || null,
        status,
        monthlyDuesAmount: monthlyDuesAmount!,
        accountNumber,
        openingBalance: openingBalance!,
        openingBalanceAsOf,
      });
    }
  });

  return { templateVersion: ONBOARDING_HOMEOWNER_TEMPLATE_VERSION, fileHash, headers, rows: parsedRows, errors };
}

function parseCsvMatrix(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    const next = input[index + 1];
    if (quoted && character === '"' && next === '"') {
      cell += '"';
      index++;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && next === "\n") index++;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function parseMoney(value: string | undefined) {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(Math.round(parsed * 100)) ? parsed : null;
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
