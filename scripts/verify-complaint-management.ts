import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import "./register-server-only-shim.cjs";
import { hash } from "bcryptjs";
import { ComplaintPrivacyMode, ComplaintStatus, Role, TenantModule } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { runWithTenant } from "@/lib/tenant-context";
import { requireTenantModule } from "@/lib/tenant";
import {
  getAdminComplaintDetail,
  getComplaintReports,
  getHomeownerComplaintDetail,
  getHomeownerComplaintList,
  revealConfidentialIdentity,
  submitComplaint,
  trackAnonymousComplaint,
  updateComplaintStatus,
} from "@/lib/services/complaints";

if (isMainModule()) {
  loadLocalEnv();
  assertComplaintVerificationDatabase();
}

const checks: string[] = [];
const runId = Date.now().toString(36);
const tenantId = `tenant_cm_verify_${runId}`;
const otherTenantId = `tenant_cm_other_${runId}`;
const disabledTenantId = `tenant_cm_disabled_${runId}`;

if (isMainModule()) {
  main().catch(async (error) => {
    console.error(error);
    await platformPrisma.$disconnect();
    process.exit(1);
  });
}

async function main() {
  try {
    const passwordHash = await hash("VerifyPass123!", 12);
    await cleanup();
    const tenant = await createTenant(tenantId, `cm-verify-${runId}`, true);
    await createTenant(otherTenantId, `cm-other-${runId}`, true);
    await createTenant(disabledTenantId, `cm-disabled-${runId}`, false);

    const homeownerUser = await platformPrisma.user.create({ data: { tenantId, name: "Complaint Verify Homeowner", email: `cm-homeowner-${runId}@example.test`, username: `cmhome${runId}`, passwordHash, role: Role.HOMEOWNER, active: true } });
    const homeowner = await platformPrisma.homeownerProfile.create({ data: { tenantId, userId: homeownerUser.id, address: "Verify Street", block: "V", lot: runId.slice(-3), phone: "09170000000", monthlyDuesAmount: 0 } });
    const otherHomeownerUser = await platformPrisma.user.create({ data: { tenantId, name: "Complaint Verify Other Homeowner", email: `cm-other-homeowner-${runId}@example.test`, username: `cmotherhome${runId}`, passwordHash, role: Role.HOMEOWNER, active: true } });
    const otherHomeowner = await platformPrisma.homeownerProfile.create({ data: { tenantId, userId: otherHomeownerUser.id, address: "Other Street", block: "O", lot: runId.slice(-2), phone: "09170000001", monthlyDuesAmount: 0 } });
    const admin = await platformPrisma.user.create({ data: { tenantId, name: "Complaint Verify Admin", email: `cm-admin-${runId}@example.test`, username: `cmadmin${runId}`, passwordHash, role: Role.ADMIN, active: true } });
    const staff = await platformPrisma.user.create({ data: { tenantId, name: "Complaint Verify Staff", email: `cm-staff-${runId}@example.test`, username: `cmstaff${runId}`, passwordHash, role: Role.STAFF, active: true } });
    const otherTenantAdmin = await platformPrisma.user.create({ data: { tenantId: otherTenantId, name: "Other Tenant Admin", email: `cm-other-admin-${runId}@example.test`, username: `cmotheradmin${runId}`, passwordHash, role: Role.ADMIN, active: true } });

    const homeownerContext = userContext(homeownerUser, tenant.slug, homeowner);
    const otherHomeownerContext = userContext(otherHomeownerUser, tenant.slug, otherHomeowner);
    const adminContext = userContext(admin, tenant.slug, null);
    const staffContext = userContext(staff, tenant.slug, null);

    await runWithTenant(tenantId, async () => {
      await requireTenantModule(tenantId, TenantModule.COMPLAINTS);
      checks.push("enabled tenant module access passed");

      const named = await submitComplaint({ user: homeownerContext, formData: complaintForm("NAMED", "Named verification complaint"), tenantSlug: tenant.slug });
      if (!named.publicReference || !named.detailHref) throw new Error("Named submission did not return a public reference and safe detail link.");
      const namedStored = await platformPrisma.complaint.findUniqueOrThrow({ where: { id: named.complaintId }, select: { requestedAction: true } });
      if (namedStored.requestedAction !== "Requested action for Named verification complaint") throw new Error("Requested Action was not persisted for named complaint.");
      checks.push("named submission reference and requested action passed");

      const confidential = await submitComplaint({ user: homeownerContext, formData: complaintForm("CONFIDENTIAL", "Confidential verification complaint"), tenantSlug: tenant.slug });
      if (!confidential.publicReference || !confidential.detailHref) throw new Error("Confidential submission did not return a public reference and safe detail link.");
      await platformPrisma.complaintMessage.updateMany({ where: { tenantId, complaintId: confidential.complaintId }, data: { authorDisplayName: homeownerUser.name } });
      const adminDetail = await getAdminComplaintDetail(staffContext, confidential.complaintId!);
      const adminText = JSON.stringify(adminDetail);
      if (adminText.includes(homeownerUser.name) || adminText.includes(homeownerUser.email) || adminText.includes(homeowner.id)) throw new Error("Confidential ordinary admin response leaked homeowner identity.");
      if (!adminText.includes("Confidential Complainant")) throw new Error("Confidential admin response did not use the safe complainant label.");
      checks.push("confidential admin service masking and existing-record handling passed");

      const homeownerList = await getHomeownerComplaintList(homeownerContext);
      if (!homeownerList.some((item) => item.id === named.complaintId)) throw new Error("Homeowner list does not include own named complaint.");
      if (!homeownerList.some((item) => item.id === confidential.complaintId)) throw new Error("Homeowner list does not include own confidential complaint.");
      const confidentialHomeownerDetail = await getHomeownerComplaintDetail(homeownerContext, confidential.complaintId!);
      if (!confidentialHomeownerDetail || confidentialHomeownerDetail.requestedAction !== "Requested action for Confidential verification complaint") throw new Error("Homeowner confidential detail was not accessible with requested action.");
      const otherHomeownerDetail = await getHomeownerComplaintDetail(otherHomeownerContext, confidential.complaintId!);
      if (otherHomeownerDetail) throw new Error("Another homeowner could access confidential complaint detail.");
      checks.push("homeowner named/confidential history and ownership passed");

      const anonymous = await submitComplaint({ user: homeownerContext, formData: complaintForm("ANONYMOUS", "Anonymous verification complaint"), tenantSlug: tenant.slug });
      if (!anonymous.trackingCode || !anonymous.trackingPin || !anonymous.complaintId) throw new Error("Anonymous submission did not return tracking credentials.");
      const anonymousStored = await platformPrisma.complaint.findUniqueOrThrow({ where: { id: anonymous.complaintId }, include: { trackingCredential: true, confidentialIdentity: true } });
      if (anonymousStored.submittedById || anonymousStored.homeownerId || anonymousStored.confidentialIdentity) throw new Error("Anonymous complaint stored identity-linked fields.");
      if (!anonymousStored.trackingCredential || anonymousStored.trackingCredential.pinHash === anonymous.trackingPin) throw new Error("Tracking PIN was not stored as a salted hash.");
      if ((await getHomeownerComplaintList(homeownerContext)).some((item) => item.id === anonymous.complaintId)) throw new Error("Anonymous complaint appeared in authenticated homeowner history.");
      const tracked = await trackAnonymousComplaint(anonymous.trackingCode, anonymous.trackingPin);
      if (tracked.publicReference !== anonymousStored.publicReference || tracked.requestedAction !== "Requested action for Anonymous verification complaint") throw new Error("Anonymous tracking returned the wrong safe complaint data.");
      checks.push("anonymous identity separation and tracking passed");

      let unauthorizedRevealBlocked = false;
      try {
        await revealConfidentialIdentity(staffContext, revealForm(confidential.complaintId!, "Valid business reason", true));
      } catch {
        unauthorizedRevealBlocked = true;
      }
      if (!unauthorizedRevealBlocked) throw new Error("Unauthorized handler could reveal confidential identity.");
      let missingReasonBlocked = false;
      try {
        await revealConfidentialIdentity(adminContext, revealForm(confidential.complaintId!, "", true));
      } catch {
        missingReasonBlocked = true;
      }
      if (!missingReasonBlocked) throw new Error("Identity reveal without reason was not blocked.");
      const reveal = await revealConfidentialIdentity(adminContext, revealForm(confidential.complaintId!, "Privacy investigation reason", true));
      if (reveal.displayName !== homeownerUser.name) throw new Error("Authorized reveal did not return confidential identity to the reveal flow.");
      const revealAudit = await platformPrisma.auditLog.findFirst({ where: { tenantId, action: "REVEAL_CONFIDENTIAL_IDENTITY", entityId: confidential.complaintId } });
      if (!revealAudit || JSON.stringify(revealAudit.metadata).includes(homeownerUser.email)) throw new Error("Identity reveal audit was missing or contained confidential identity.");
      checks.push("confidential reveal authorization, reason, and audit passed");

      const reports = await getComplaintReports(adminContext, { privacy: "CONFIDENTIAL" });
      if (JSON.stringify(reports).includes(homeownerUser.name) || JSON.stringify(reports).includes(homeownerUser.email)) throw new Error("Complaint reports leaked confidential identity.");
      if (reports.filteredTotal < 1 || reports.rows.some((item) => item.privacyMode !== "CONFIDENTIAL")) throw new Error("Complaint reports were not filtered as requested.");
      checks.push("tenant-scoped masked reports passed");

      await expectStatusBlocked(adminContext, named.complaintId!, ComplaintStatus.CLOSED, "Closing too early");
      await expectStatusBlocked(adminContext, named.complaintId!, ComplaintStatus.REJECTED, "");
      await expectStatusBlocked(adminContext, named.complaintId!, ComplaintStatus.RESOLVED, "");
      await expectStatusBlocked(adminContext, named.complaintId!, ComplaintStatus.REOPENED, "short");
      await transition(adminContext, named.complaintId!, ComplaintStatus.ACKNOWLEDGED, null);
      await transition(adminContext, named.complaintId!, ComplaintStatus.TRIAGED, null);
      await transition(adminContext, named.complaintId!, ComplaintStatus.ASSIGNED, null);
      await transition(adminContext, named.complaintId!, ComplaintStatus.UNDER_REVIEW, null);
      await transition(adminContext, named.complaintId!, ComplaintStatus.RESOLVED, "Resolved with a safe verification summary.");
      await transition(adminContext, named.complaintId!, ComplaintStatus.CLOSED, "Closed after documented resolution.");
      checks.push("workflow transition policy and required reasons passed");

      const otherAdminContext = userContext(otherTenantAdmin, `cm-other-${runId}`, null);
      await expectStatusBlocked(otherAdminContext, named.complaintId!, ComplaintStatus.ARCHIVED, "Cross tenant blocked");
      checks.push("cross-tenant transition blocked passed");
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

    assertSourceInvariant("lib/services/complaints.ts", "Confidential Complainant");
    assertSourceInvariant("lib/services/complaints.ts", "requestedAction");
    assertSourceInvariant("lib/services/complaints.ts", "validateComplaintTransition");
    assertSourceInvariant("app/uploads/complaints/[...path]/route.ts", "Content-Disposition");
    assertSourceInvariant("lib/actions/auth.ts", "compare(");
    assertSourceInvariant("lib/auth.ts", "createSession");
    checks.push("source privacy, attachment, password login, and tenant session invariants passed");

    console.log("Complaint management verification passed:");
    for (const check of checks) console.log(`- ${check}`);
  } finally {
    await cleanup();
    await platformPrisma.$disconnect();
  }
}

async function createTenant(id: string, slug: string, complaintsEnabled: boolean) {
  const planId = `plan_${id}`;
  const planCode = `CM_${id}`;
  await platformPrisma.subscriptionPlan.create({
    data: {
      id: planId,
      code: planCode,
      name: `Complaint Verify Plan ${slug}`,
      active: true,
      trialDays: 0,
      modules: complaintsEnabled ? { create: { module: TenantModule.COMPLAINTS, enabled: true } } : undefined,
    },
  });
  const tenant = await platformPrisma.tenant.create({
    data: {
      id,
      name: `Complaint Verify ${slug}`,
      shortName: "CM Verify",
      slug,
      status: "ACTIVE",
      subscriptionPlan: planCode,
      subscriptionStatus: "ACTIVE",
      moduleEntitlements: complaintsEnabled ? { create: { module: TenantModule.COMPLAINTS, enabled: true } } : undefined,
    },
  });
  await platformPrisma.tenantSubscription.create({
    data: { tenantId: id, planId, status: "ACTIVE", startedAt: new Date(), currency: "PHP" },
  });
  return tenant;
}

function userContext(user: { id: string; tenantId: string; name: string; email: string; role: Role }, tenantSlug: string, homeownerProfile: { id: string } | null) {
  return { id: user.id, tenantId: user.tenantId, name: user.name, email: user.email, role: user.role, tenant: { id: user.tenantId, slug: tenantSlug, name: tenantSlug }, homeownerProfile } as never;
}

function complaintForm(mode: keyof typeof ComplaintPrivacyMode, title: string) {
  const formData = new FormData();
  formData.set("privacyMode", ComplaintPrivacyMode[mode]);
  formData.set("title", title);
  formData.set("description", `${title} details are long enough for complaint validation and safe review.`);
  formData.set("requestedAction", `Requested action for ${title}`);
  formData.set("severity", "MEDIUM");
  formData.set("priority", "NORMAL");
  return formData;
}

function revealForm(id: string, reason: string, confirmReveal: boolean) {
  const formData = new FormData();
  formData.set("id", id);
  formData.set("reason", reason);
  if (confirmReveal) formData.set("confirmReveal", "on");
  return formData;
}

async function transition(user: never, id: string, status: ComplaintStatus, note: string | null) {
  const formData = new FormData();
  formData.set("id", id);
  formData.set("status", status);
  if (note) formData.set("note", note);
  await updateComplaintStatus(user, formData);
}

async function expectStatusBlocked(user: never, id: string, status: ComplaintStatus, note: string) {
  let blocked = false;
  try {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("status", status);
    if (note) formData.set("note", note);
    await updateComplaintStatus(user, formData);
  } catch {
    blocked = true;
  }
  if (!blocked) throw new Error(`Status transition to ${status} was not blocked.`);
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
  await platformPrisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await platformPrisma.subscriptionPlan.deleteMany({ where: { id: { startsWith: "plan_tenant_cm_" } } });
}

function assertSourceInvariant(file: string, needle: string) {
  const content = readFileSync(path.join(process.cwd(), file), "utf8");
  if (!content.includes(needle)) throw new Error(`Missing source invariant in ${file}: ${needle}`);
}

type ComplaintVerificationDatabaseEnvironment = "Local UAT" | "GitHub Actions CI";

export function getComplaintVerificationDatabaseGuard(
  databaseUrl = process.env.DATABASE_URL || "",
  githubActions = process.env.GITHUB_ACTIONS,
) {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  const host = url.hostname;
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const loopbackHost = host === "127.0.0.1" || host === "localhost";
  const environment: ComplaintVerificationDatabaseEnvironment | null =
    loopbackHost && databaseName === "hoahub_prodclone_local"
      ? "Local UAT"
      : githubActions === "true" && loopbackHost && databaseName === "hoa_portal"
        ? "GitHub Actions CI"
        : null;

  if (!environment) {
    throw new Error(`Refusing to run complaint verification outside an approved database. Current host=${host}, database=${databaseName}`);
  }

  return { environment, host, databaseName };
}

function assertComplaintVerificationDatabase() {
  const guard = getComplaintVerificationDatabaseGuard();
  console.log(`Complaint verification database environment: ${guard.environment}`);
  console.log(`Complaint verification database host: ${guard.host}`);
  console.log(`Complaint verification database name: ${guard.databaseName}`);
  console.log("Complaint verification database safety guard passed.");
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

function isMainModule() {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}
