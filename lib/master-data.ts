export type MasterDataType = "homeowners" | "contractors" | "vehicles" | "employees" | "attendance";

export const masterDataTemplates: Record<MasterDataType, string[]> = {
  homeowners: ["name", "email", "password", "phone", "address", "block", "lot", "messengerId", "status", "monthlyDuesAmount"],
  contractors: ["companyName", "contactPerson", "email", "phone", "address", "licenseNumber", "status"],
  vehicles: ["homeownerEmail", "plateNumber", "vehicleType", "make", "model", "color", "stickerNumber", "issuedAt", "expiresAt", "status", "remarks"],
  employees: ["employeeNumber", "name", "position", "email", "phone", "address", "hireDate", "salaryType", "baseRate", "standardWorkDays", "fixedAllowance", "fixedDeduction", "status"],
  attendance: ["employeeNumber", "date", "timeIn", "timeOut", "status", "overtimeHours", "remarks"],
};

export function buildCsv(headers: string[], rows: Array<Array<unknown>>) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}
