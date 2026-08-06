import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { buildCsv, masterDataTemplates, type MasterDataType } from "@/lib/master-data";

export async function GET(request: Request) {
  await requireUser(Role.ADMIN);
  const type = new URL(request.url).searchParams.get("type") as MasterDataType;
  if (!type || !(type in masterDataTemplates)) return new Response("Invalid template type.", { status: 400 });
  if (type === "homeowners") {
    return new Response("The legacy homeowner template is retired because it accepted plaintext passwords. Use /admin/onboarding/template.", {
      status: 410,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const headers = masterDataTemplates[type];
  const sample = sampleRow(type);
  return csvResponse(buildCsv(headers, [sample]), `template-${type}.csv`);
}

function sampleRow(type: Exclude<MasterDataType, "homeowners">) {
  const rows: Record<Exclude<MasterDataType, "homeowners">, string[]> = {
    contractors: ["ABC Construction", "Pedro Santos", "pedro@example.com", "09171111111", "Contractor office address", "LIC-001", "ACTIVE"],
    vehicles: ["juan@example.com", "ABC1234", "CAR", "Toyota", "Vios", "White", "STK-0001", "2026-06-24", "2027-06-24", "ACTIVE", ""],
    employees: ["EMP-001", "Ana Reyes", "Collector", "ana@example.com", "09172222222", "Employee address", "2026-06-01", "MONTHLY", "18000", "26", "1000", "0", "ACTIVE"],
    attendance: ["EMP-001", "2026-06-24", "08:00", "17:00", "PRESENT", "0", ""],
  };
  return rows[type];
}

function csvResponse(csv: string, filename: string) {
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
