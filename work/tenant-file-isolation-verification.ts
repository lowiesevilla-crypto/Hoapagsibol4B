import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { SignJWT } from "jose";
import { PrismaClient, TenantModule } from "@prisma/client";
import { tenantUploadDirectory } from "../lib/storage";

const prisma = new PrismaClient();
const stamp = Date.now();
const marker = `file-isolation-${stamp}`;
let secret = new Uint8Array();
const checks: string[] = [];

function check(condition: unknown, label: string) { if (!condition) throw new Error(`FAILED: ${label}`); checks.push(label); }

async function createTenant(suffix: string) {
  const slug = `${marker}-${suffix.toLowerCase()}`;
  const tenant = await prisma.tenant.create({ data: { name: `File Isolation ${suffix}`, shortName: `FI${suffix}`, slug, moduleEntitlements: { create: Object.values(TenantModule).map((module) => ({ module, enabled: true })) } } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: `Resident ${suffix}`, email: `${marker}-${suffix}@example.invalid`, passwordHash: "not-used", role: "HOMEOWNER" } });
  const homeowner = await prisma.homeownerProfile.create({ data: { tenantId: tenant.id, userId: user.id, address: "Test", block: suffix, lot: "1", phone: "09000000000", monthlyDuesAmount: 100 } });
  return { tenant, user, homeowner };
}

async function tokenFor(fixture: Awaited<ReturnType<typeof createTenant>>) {
  return new SignJWT({ userId: fixture.user.id, role: fixture.user.role, tenantId: fixture.tenant.id, tenantSlug: fixture.tenant.slug }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(secret);
}

async function writeTenantFile(slug: string, category: string, relative: string) {
  const parts = relative.split("/");
  const directory = tenantUploadDirectory(slug, category, ...parts.slice(0, -1));
  await mkdir(directory, { recursive: true });
  await writeFile(tenantUploadDirectory(slug, category, ...parts), Buffer.from("tenant-isolation-file"));
}

async function cleanup(fixture: Awaited<ReturnType<typeof createTenant>>) {
  await prisma.chatAttachment.deleteMany({ where: { tenantId: fixture.tenant.id } });
  await prisma.chatMessage.deleteMany({ where: { tenantId: fixture.tenant.id } });
  await prisma.chatParticipant.deleteMany({ where: { tenantId: fixture.tenant.id } });
  await prisma.chatConversation.deleteMany({ where: { tenantId: fixture.tenant.id } });
  await prisma.paymentRequest.deleteMany({ where: { tenantId: fixture.tenant.id } });
  await prisma.homeownerProfile.deleteMany({ where: { tenantId: fixture.tenant.id } });
  await prisma.user.deleteMany({ where: { tenantId: fixture.tenant.id } });
  await prisma.tenantModuleEntitlement.deleteMany({ where: { tenantId: fixture.tenant.id } });
  await prisma.tenant.delete({ where: { id: fixture.tenant.id } });
  await rm(tenantUploadDirectory(fixture.tenant.slug), { recursive: true, force: true });
}

async function main() {
  const secretText = (await readFile(new URL("../.env", import.meta.url), "utf8")).match(/^AUTH_SECRET="?([^"\r\n]+)"?/m)?.[1];
  if (!secretText) throw new Error("AUTH_SECRET not found.");
  secret = new TextEncoder().encode(secretText);
  let a: Awaited<ReturnType<typeof createTenant>> | undefined;
  let b: Awaited<ReturnType<typeof createTenant>> | undefined;
  try {
    a = await createTenant("A"); b = await createTenant("B");
    const paymentRelative = "2099-01/proof.pdf";
    const chatRelative = "2099-01/chat.pdf";
    for (const fixture of [a, b]) {
      await writeTenantFile(fixture.tenant.slug, "payments", paymentRelative);
      await writeTenantFile(fixture.tenant.slug, "chat", chatRelative);
      const proofUrl = `/uploads/payments/${fixture.tenant.slug}/${paymentRelative}`;
      await prisma.paymentRequest.create({ data: { tenantId: fixture.tenant.id, type: "OTHER_COLLECTION", homeownerId: fixture.homeowner.id, collectionType: "OTHER", amount: 1, paymentDate: new Date("2099-01-01T00:00:00.000Z"), referenceNumber: `${marker}-${fixture.tenant.slug}`, proofImageUrl: proofUrl } });
      await prisma.chatConversation.create({ data: { tenantId: fixture.tenant.id, homeownerId: fixture.user.id, createdById: fixture.user.id, participants: { create: { tenantId: fixture.tenant.id, userId: fixture.user.id } }, messages: { create: { tenantId: fixture.tenant.id, senderId: fixture.user.id, attachmentUrl: `/uploads/chat/${fixture.tenant.slug}/${chatRelative}`, attachmentName: "chat.pdf", attachmentContentType: "application/pdf" } } } });
    }
    const tokenA = await tokenFor(a);
    const headers = { cookie: `hoa_session=${tokenA}` };
    const ownPayment = await fetch(`http://localhost:3000/uploads/payments/${a.tenant.slug}/${paymentRelative}`, { headers });
    const crossPayment = await fetch(`http://localhost:3000/uploads/payments/${b.tenant.slug}/${paymentRelative}`, { headers });
    const ownChat = await fetch(`http://localhost:3000/uploads/chat/${a.tenant.slug}/${chatRelative}`, { headers });
    const crossChat = await fetch(`http://localhost:3000/uploads/chat/${b.tenant.slug}/${chatRelative}`, { headers });
    check(ownPayment.status === 200, "homeowner can read an owned payment proof inside the tenant upload root");
    check(crossPayment.status === 403, "homeowner cannot read another tenant payment proof by URL");
    check(ownChat.status === 200, "conversation participant can read an attachment inside the tenant upload root");
    check(crossChat.status === 403, "conversation participant cannot read another tenant chat attachment by URL");
  } finally {
    if (a) await cleanup(a);
    if (b) await cleanup(b);
    await prisma.$disconnect();
  }
  console.log(`PASS ${checks.length} tenant file isolation checks`);
  for (const label of checks) console.log(`- ${label}`);
  console.log("TENANT_FILE_TEST_DATA_CLEANED");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
