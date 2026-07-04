import { readFile, rm, writeFile } from "node:fs/promises";
import { hash } from "bcryptjs";
import { PrismaClient, Role, TenantModule } from "@prisma/client";

const prisma = new PrismaClient(); const stateFile = new URL("./tenant-management-state.json", import.meta.url); const password = "LocalTest!2026";
async function setup() {
  const stamp = Date.now(); const slug = `local-test-hoa-${stamp}`; const email = `local-admin-${stamp}@example.invalid`;
  const tenant = await prisma.tenant.create({ data: { name: "Local Verification Homeowners Association", shortName: "LVHOA", slug, address: "Local test address", subscriptionPlan: "LOCAL_TEST", moduleEntitlements: { create: Object.values(TenantModule).map((module) => ({ module, enabled: true })) } } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: "Local Tenant Administrator", email, passwordHash: await hash(password, 12), role: Role.HOA_ADMIN } });
  const superEmail = `local-super-${stamp}@example.invalid`; const superUser = await prisma.user.create({ data: { tenantId: "tenant_pagsibol4b_default", name: "Local Platform Tester", email: superEmail, passwordHash: await hash(password, 12), role: Role.SUPER_ADMIN } });
  await writeFile(stateFile, JSON.stringify({ tenantId: tenant.id, userId: user.id, slug, email, password, superUserId: superUser.id, superEmail }, null, 2));
  console.log(JSON.stringify({ slug, email, password }));
}
async function verify() {
  const state = JSON.parse(await readFile(stateFile, "utf8")); const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: state.tenantId }, include: { users: true } });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenant.slug)) throw new Error("Invalid saved tenant slug");
  if (tenant.users.length !== 1 || tenant.users[0].tenantId !== tenant.id) throw new Error("Tenant users are not isolated");
  if (await prisma.user.count({ where: { id: state.userId, tenantId: "tenant_pagsibol4b_default" } })) throw new Error("Cross-tenant user visibility detected");
  console.log("TENANT_MANAGEMENT_DB_PASS=3");
}
async function cleanup() {
  const state = JSON.parse(await readFile(stateFile, "utf8")); await prisma.auditLog.deleteMany({ where: { OR: [{ tenantId: state.tenantId }, { actorId: state.superUserId }] } }); await prisma.user.deleteMany({ where: { tenantId: state.tenantId } }); if (state.superUserId) await prisma.user.deleteMany({ where: { id: state.superUserId } }); await prisma.tenant.delete({ where: { id: state.tenantId } }); await rm(stateFile, { force: true }); console.log("TENANT_MANAGEMENT_TEST_DATA_CLEANED");
}
async function status(status: "ACTIVE" | "SUSPENDED") { const state = JSON.parse(await readFile(stateFile, "utf8")); await prisma.tenant.update({ where: { id: state.tenantId }, data: { status, advisories: status === "SUSPENDED" ? { create: { message: "Local verification suspension advisory." } } : undefined } }); console.log(`TENANT_STATUS=${status}`); }
async function main() { const mode = process.argv[2]; try { if (mode === "setup") await setup(); else if (mode === "verify") await verify(); else if (mode === "cleanup") await cleanup(); else if (mode === "suspend") await status("SUSPENDED"); else if (mode === "activate") await status("ACTIVE"); else throw new Error("Use setup, verify, suspend, activate, or cleanup"); } finally { await prisma.$disconnect(); } }
void main().catch((error) => { console.error(error); process.exitCode = 1; });
