import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import "./register-server-only-shim.cjs";
import { hash } from "bcryptjs";
import { ComplaintPrivacyMode, Role, TenantModule } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { runWithTenant } from "@/lib/tenant-context";
import { requireTenantModule } from "@/lib/tenant";
import { submitComplaint, trackAnonymousComplaint } from "@/lib/services/complaints";

loadLocalEnv();
assertLocalDatabase();

const checks: string[] = [];
const runId = Date.now().toString(36);
const tenantId = `tenant_cm_verify_${runId}`;
const disabledTenantId = `tenant_cm_disabled_${runId}`;

main().catch(async (error) => {
  console.error(error);
  await platformPrisma.$disconnect();
  process.exit(1);
});

async function main() {
const passwordHash = await hash("VerifyPass123!", 12);
try {
  await cleanup();
  await platformPrisma.tenant.create({ data: { id: tenantId, name: `Complaint Verify ${runId}`, shortName: "CM Verify", slug: `cm-verify-${runId}`, status: "ACTIVE", subscriptionStatus: "ACTIVE", moduleEntitlements: { create: { module: TenantModule.COMPLAINTS, enabled: true } } } });
  await platformPrisma.tenant.create({ data: { id: disabledTenantId, name: `Complaint Disabled ${runId}`, shortName: "CM Disabled", slug: `cm-disabled-${runId}`, status: "ACTIVE", subscriptionStatus: "ACTIVE" } });
  const homeownerUser = await platformPrisma.user.create({ data: { tenantId, name: "Complaint Verify Homeowner", email: `cm-homeowner-${runId}@example.test`, username: `cmhome${runId}`, passwordHash, role: Role.HOMEOWNER, active: true } });
  const homeowner = await platformPrisma.homeownerProfile.create({ data: { tenantId, userId: homeownerUser.id, address: "Verify Street", block: "V", lot: runId.slice(-3), phone: "09170000000", monthlyDuesAmount: 0 } });
  await platformPrisma.user.create({ data: { tenantId, name: "Complaint Verify Admin", email: `cm-admin-${runId}@example.test`, username: `cmadmin${runId}`, passwordHash, role: Role.ADMIN, active: true } });

  await runWithTenant(tenantId, async () => {
    await requireTenantModule(tenantId, TenantModule.COMPLAINTS);
    checks.push("enabled tenant module access passed");
    const formData = new FormData();
    formData.set("privacyMode", ComplaintPrivacyMode.ANONYMOUS);
    formData.set("title", "Anonymous verification complaint");
    formData.set("description", "Anonymous verification complaint details are long enough for validation.");
    formData.set("severity", "MEDIUM");
    formData.set("priority", "NORMAL");
    const state = await submitComplaint({
      user: { id: homeownerUser.id, tenantId, name: homeownerUser.name, email: homeownerUser.email, role: homeownerUser.role, tenant: { id: tenantId, slug: `cm-verify-${runId}`, name: `Complaint Verify ${runId}` }, homeownerProfile: homeowner } as never,
      formData,
      tenantSlug: `cm-verify-${runId}`,
    });
    if (!state.trackingCode || !state.trackingPin || !state.complaintId) throw new Error("Anonymous submission did not return tracking credentials.");
    const stored = await platformPrisma.complaint.findUniqueOrThrow({ where: { id: state.complaintId }, include: { trackingCredential: true, confidentialIdentity: true } });
    if (stored.submittedById || stored.homeownerId || stored.confidentialIdentity) throw new Error("Anonymous complaint stored identity-linked fields.");
    if (!stored.trackingCredential || stored.trackingCredential.pinHash === state.trackingPin) throw new Error("Tracking PIN was not stored as a salted hash.");
    checks.push("anonymous identity separation passed");
    const tracked = await trackAnonymousComplaint(state.trackingCode, state.trackingPin);
    if (tracked.publicReference !== stored.publicReference || tracked.title !== stored.title) throw new Error("Tracking lookup returned the wrong complaint.");
    checks.push("anonymous tracking code and PIN passed");
  }, { role: Role.HOMEOWNER, enabledModules: [TenantModule.COMPLAINTS] });

  await runWithTenant(disabledTenantId, async () => {
    let blocked = false;
    try {
      await requireTenantModule(disabledTenantId, TenantModule.COMPLAINTS);
    } catch {
      blocked = true;
    }
    if (!blocked) throw new Error("Missing COMPLAINTS entitlement was not blocked.");
    checks.push("disabled complaint entitlement passed");
  }, { role: Role.HOMEOWNER, enabledModules: [] });

  assertSourceInvariant("lib/services/complaints.ts", "submittedById: privacyMode === ComplaintPrivacyMode.NAMED ? user.id : null");
  assertSourceInvariant("lib/services/complaints.ts", "homeownerId: privacyMode === ComplaintPrivacyMode.NAMED ? homeowner?.id ?? null : null");
  assertSourceInvariant("lib/services/complaints.ts", "platformRoles.has(user.role)");
  assertSourceInvariant("lib/actions/auth.ts", "compare(");
  assertSourceInvariant("lib/auth.ts", "createSession");
  checks.push("source privacy, password login, and tenant session invariants passed");

  console.log("Complaint management verification passed:");
  for (const check of checks) console.log(`- ${check}`);
} finally {
  await cleanup();
  await platformPrisma.$disconnect();
}
}

async function cleanup() {
  const tenantIds = (await platformPrisma.tenant.findMany({ where: { id: { startsWith: "tenant_cm_" } }, select: { id: true } })).map((item) => item.id);
  if (!tenantIds.length) return;
  await platformPrisma.complaintIdentityAccessGrant.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.complaintAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.complaintTimelineEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.complaintStatusHistory.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.complaintMessage.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.complaintAttachment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.complaintTrackingCredential.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.complaintConfidentialIdentity.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.complaint.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.complaintCategory.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.complaintSetting.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.auditLog.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { actor: { tenantId: { in: tenantIds } } }] } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.userSession.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenantModuleEntitlement.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenantSequence.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

function assertSourceInvariant(file: string, needle: string) {
  const content = readFileSync(path.join(process.cwd(), file), "utf8");
  if (!content.includes(needle)) throw new Error(`Missing source invariant in ${file}: ${needle}`);
}

function assertLocalDatabase() {
  const databaseUrl = process.env.DATABASE_URL || "";
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!localHost || !url.pathname.includes("hoahub_prodclone_local")) {
    throw new Error(`Refusing to run complaint verification outside local database. Current host=${url.hostname}, database=${url.pathname.replace("/", "")}`);
  }
  console.log(`Local DATABASE_URL verified: host=${url.hostname}, database=${url.pathname.replace("/", "")}`);
}

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    const fullPath = path.join(process.cwd(), file);
    if (!existsSync(fullPath)) continue;
    for (const line of readFileSync(fullPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }
}
