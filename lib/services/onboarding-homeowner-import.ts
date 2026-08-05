import { createHash } from "node:crypto";

export const ONBOARDING_HOMEOWNER_TEMPLATE_VERSION = "1.0";
export const ONBOARDING_HOMEOWNER_HEADERS = [
  "name",
  "email",
  "phone",
  "address",
  "block",
  "lot",
  "phase",
  "propertyType",
  "occupancyStatus",
  "accountNumber",
  "monthlyDuesAmount",
  "openingBalance",
] as const;

export type OnboardingHomeownerRow = Record<(typeof ONBOARDING_HOMEOWNER_HEADERS)[number], string>;
export type OnboardingRowError = { row: number; field: string; message: string };
export type OnboardingImportPreview = {
  version: string;
  fingerprint: string;
  rows: Array<{ rowNumber: number; data: OnboardingHomeownerRow }>;
  errors: OnboardingRowError[];
  totals: { rows: number; openingBalance: number };
};

export function parseOnboardingHomeownerCsv(input: string): OnboardingImportPreview {
  const matrix = parseCsv(input);
  const headers = (matrix.shift() ?? []).map((value) => value.trim());
  const errors: OnboardingRowError[] = [];
  for (const header of ONBOARDING_HOMEOWNER_HEADERS) {
    if (!headers.includes(header)) errors.push({ row: 1, field: header, message: "Missing required template column." });
  }
  const rows = matrix.filter((row) => row.some((value) => value.trim())).map((values, index) => ({
    rowNumber: index + 2,
    data: Object.fromEntries(ONBOARDING_HOMEOWNER_HEADERS.map((header) => [header, String(values[headers.indexOf(header)] ?? "").trim()])) as OnboardingHomeownerRow,
  }));
  const seenEmails = new Set<string>();
  const seenProperties = new Set<string>();
  const seenAccounts = new Set<string>();
  for (const row of rows) {
    const data = row.data;
    for (const field of ["name", "email", "phone", "address", "block", "lot", "monthlyDuesAmount"] as const) {
      if (!data[field]) errors.push({ row: row.rowNumber, field, message: "Required." });
    }
    const email = data.email.toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ row: row.rowNumber, field: "email", message: "Invalid email." });
    const propertyKey = `${data.block.toLowerCase()}|${data.lot.toLowerCase()}`;
    if (email && seenEmails.has(email)) errors.push({ row: row.rowNumber, field: "email", message: "Duplicate email inside upload." });
    if (propertyKey !== "|" && seenProperties.has(propertyKey)) errors.push({ row: row.rowNumber, field: "lot", message: "Duplicate block and lot inside upload." });
    if (data.accountNumber && !/^[1-9][0-9]{10}$/.test(data.accountNumber)) errors.push({ row: row.rowNumber, field: "accountNumber", message: "Use an 11-digit account number or leave blank for secure allocation." });
    if (data.accountNumber && seenAccounts.has(data.accountNumber)) errors.push({ row: row.rowNumber, field: "accountNumber", message: "Duplicate account number inside upload." });
    const dues = Number(data.monthlyDuesAmount);
    const opening = Number(data.openingBalance || 0);
    if (!Number.isFinite(dues) || dues < 0) errors.push({ row: row.rowNumber, field: "monthlyDuesAmount", message: "Must be zero or a positive amount." });
    if (!Number.isFinite(opening) || opening < 0) errors.push({ row: row.rowNumber, field: "openingBalance", message: "Must be zero or a positive amount." });
    seenEmails.add(email);
    seenProperties.add(propertyKey);
    if (data.accountNumber) seenAccounts.add(data.accountNumber);
  }
  const normalized = rows.map(({ data }) => ONBOARDING_HOMEOWNER_HEADERS.map((header) => data[header]).join("\u001f")).join("\u001e");
  return {
    version: ONBOARDING_HOMEOWNER_TEMPLATE_VERSION,
    fingerprint: createHash("sha256").update(normalized).digest("hex"),
    rows,
    errors,
    totals: { rows: rows.length, openingBalance: rows.reduce((total, row) => total + Number(row.data.openingBalance || 0), 0) },
  };
}

export function onboardingHomeownerTemplateCsv() {
  return [
    `# HOAHub homeowner onboarding template v${ONBOARDING_HOMEOWNER_TEMPLATE_VERSION}`,
    ONBOARDING_HOMEOWNER_HEADERS.join(","),
    "Juan Dela Cruz,juan@example.com,09171234567,1 Sample Street,A,1,Phase 1,Residential,Owner Occupied,,500,0",
  ].join("\r\n");
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = input.replace(/^#.*(?:\r?\n)/, "");
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted && char === '"' && next === '"') { cell += '"'; index++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === ",") { row.push(cell); cell = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index++;
      row.push(cell); rows.push(row); row = []; cell = ""; continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
