import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose/jwt/sign";

const prisma = new PrismaClient();
const base = "http://localhost:3000";
const env = await readFile(new URL("../.env", import.meta.url), "utf8");
const authSecret = env.match(/^AUTH_SECRET="?([^"\r\n]+)"?/m)?.[1];
if (!authSecret) throw new Error("AUTH_SECRET not found.");
const checks = [];

function check(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

async function tokenFor(user) {
  return new SignJWT({ userId: user.id, role: user.role, tenantId: user.tenantId, tenantSlug: user.tenant.slug })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(authSecret));
}

async function get(path, token) {
  return fetch(`${base}${path}`, { headers: { Cookie: `hoa_session=${token}` }, redirect: "manual" });
}

try {
  const superAdmin = await prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN", active: true }, include: { tenant: true } });
  const hoaAdmin = await prisma.user.findFirstOrThrow({ where: { role: "HOA_ADMIN", active: true, tenant: { moduleEntitlements: { some: { module: "PAYROLL", enabled: true } } } }, include: { tenant: true } });
  const [superToken, hoaToken] = await Promise.all([tokenFor(superAdmin), tokenFor(hoaAdmin)]);

  const platform = await get("/platform/tenants", superToken);
  const platformHtml = await platform.text();
  check(platform.status === 200 && platformHtml.includes("Log out"), "Super Admin platform header includes logout");

  const users = await get(`/platform/tenants/${hoaAdmin.tenantId}/users`, superToken);
  const usersHtml = await users.text();
  check(users.status === 200 && usersHtml.includes("Add tenant access account"), "Super Admin can open tenant access account creation");
  check(usersHtml.includes('value="SYSTEM_ADMIN"') && usersHtml.includes("System Admin"), "Tenant System Admin is available as an assignable role");
  check(usersHtml.includes("Show password"), "tenant access password has an eye control");

  const onboarding = await get("/platform/tenants/new", superToken);
  const onboardingHtml = await onboarding.text();
  check(onboarding.status === 200 && onboardingHtml.includes('value="SYSTEM_ADMIN"'), "tenant onboarding supports a Tenant System Admin");
  check(onboardingHtml.includes("Show password"), "tenant onboarding password has an eye control");

  const employees = await get("/admin/employees", hoaToken);
  const employeesHtml = await employees.text();
  check(employees.status === 200 && employeesHtml.includes("Employees"), "HOA Admin can access Employees when PAYROLL is enabled");

  const passwordSources = [
    "../components/homeowner-form.tsx",
    "../components/employee-form.tsx",
    "../components/reset-password-form.tsx",
    "../app/admin/settings/page.tsx",
    "../app/platform/tenants/new/page.tsx",
    "../app/platform/tenants/[id]/users/[userId]/page.tsx",
  ];
  const sourceText = await Promise.all(passwordSources.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  check(sourceText.every((source) => source.includes("PasswordInput")), "all password entry and reset surfaces use the shared eye control");

  const roleSource = await readFile(new URL("../lib/tenant-roles.ts", import.meta.url), "utf8");
  check(roleSource.includes("Role.SYSTEM_ADMIN") && !roleSource.includes("Role.SUPER_ADMIN"), "tenant roles include System Admin but keep Super Admin platform-only");

  const feedbackSource = await readFile(new URL("../components/transaction-feedback.tsx", import.meta.url), "utf8");
  check(feedbackSource.includes('created: "Record has been created successfully."'), "record creation displays the centralized success prompt");

  console.log(`PASS ${checks.length} access and password checks`);
  for (const label of checks) console.log(`- ${label}`);
} finally {
  await prisma.$disconnect();
}
