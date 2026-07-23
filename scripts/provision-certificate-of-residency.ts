import { Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { provisionCertificateOfResidencyForTenant } from "@/lib/services/certificate-of-residency";
import { documentContextFromUser } from "@/lib/services/document-runtime-context";

async function main() {
  assertLocalDatabase();
  const tenantSlug = process.argv.find((argument) => argument.startsWith("--tenant="))?.slice("--tenant=".length).trim();
  if (!tenantSlug) throw new Error("Usage: pnpm tsx scripts/provision-certificate-of-residency.ts --tenant=<tenant-slug>");
  const tenant = await platformPrisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`Tenant slug ${tenantSlug} was not found.`);
  const actor = await platformPrisma.user.findFirst({ where: { tenantId: tenant.id, active: true, role: { in: [Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN] } }, orderBy: { createdAt: "asc" } });
  if (!actor) throw new Error("The target tenant needs an active authorized administrator before provisioning.");
  const result = await provisionCertificateOfResidencyForTenant(documentContextFromUser(actor, `COR_PROVISION:${Date.now()}`));
  console.log(JSON.stringify({ tenant: tenant.name, ...result }, null, 2));
}

function assertLocalDatabase() {
  if (process.env.NODE_ENV === "production") throw new Error("Certificate provisioning is disabled when NODE_ENV=production.");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Certificate provisioning requires an explicit local DATABASE_URL.");
  const url = new URL(databaseUrl);
  if (url.protocol !== "mysql:" || !new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname.toLowerCase())) throw new Error("Certificate provisioning may run only against a local MySQL database.");
}

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await platformPrisma.$disconnect();
  process.exitCode = 1;
});
