import { readFile } from "node:fs/promises";
import { PrismaClient, Role } from "@prisma/client";
import { SignJWT } from "jose/jwt/sign";

const prisma = new PrismaClient();
const envText = await readFile(new URL("../.env", import.meta.url), "utf8");
const authSecret = envText.match(/^AUTH_SECRET="?([^"\r\n]+)"?/m)?.[1];
if (!authSecret) throw new Error("AUTH_SECRET not found");
const secret = new TextEncoder().encode(authSecret);
const base = "http://localhost:3000";
const checks = [];

function check(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

async function tokenFor(user) {
  return new SignJWT({ userId: user.id, role: user.role }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(secret);
}

async function get(path, token) {
  return fetch(`${base}${path}`, { headers: token ? { Cookie: `hoa_session=${token}` } : {}, redirect: "manual" });
}

try {
  const systemAdmin = await prisma.user.findUniqueOrThrow({ where: { email: "system@pagsibol.test" } });
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@greenmeadows.test" } });
  const homeowner = await prisma.user.findFirstOrThrow({ where: { role: "HOMEOWNER", homeownerProfile: { isNot: null } }, include: { homeownerProfile: true }, orderBy: { createdAt: "asc" } });
  check(systemAdmin.role === Role.SYSTEM_ADMIN, "system admin seed has SYSTEM_ADMIN role");

  const [systemToken, adminToken, homeownerToken] = await Promise.all([tokenFor(systemAdmin), tokenFor(admin), tokenFor(homeowner)]);
  const settingsCount = await prisma.systemSetting.count();
  check(settingsCount >= 11, "starter system settings are seeded");

  const settingsPage = await get("/admin/settings", systemToken);
  const settingsHtml = await settingsPage.text();
  check(settingsPage.status === 200 && settingsHtml.includes("Configuration center"), "system admin can open configuration center");
  check(settingsHtml.includes("Association profile") && settingsHtml.includes("Association logo URL"), "association profile settings render");
  check(settingsHtml.includes("GCash and QR payments") && settingsHtml.includes("Facebook connection"), "configuration sections render");
  check(settingsHtml.includes("GCash QR image upload") && settingsHtml.includes('name="GCASH_QR_IMAGE_FILE"') && !settingsHtml.includes("GCash QR image URL"), "GCash settings use direct image upload instead of a URL textbox");

  const adminSettings = await get("/admin/settings", adminToken);
  check([307, 308].includes(adminSettings.status) && adminSettings.headers.get("location")?.includes("/admin/dashboard"), "regular admin is redirected away from system settings");

  const homeownerPay = await get("/portal/pay", homeownerToken);
  const homeownerPayHtml = await homeownerPay.text();
  check(homeownerPay.status === 200 && homeownerPayHtml.includes("Pay by QR code"), "homeowner can open QR payment page");
  check(homeownerPayHtml.includes("Submit QR payment") && homeownerPayHtml.includes("Transaction type") && homeownerPayHtml.includes("Select pending dues"), "QR page supports a unified transaction selector and multi-dues selection");
  check(!homeownerPayHtml.includes("Submit other HOA payment"), "old separate other-payment form is removed");
  const qrSetting = await prisma.systemSetting.findUnique({ where: { category_key: { category: "PAYMENT", key: "GCASH_QR_IMAGE_URL" } } });
  check(Boolean(qrSetting?.value?.startsWith("/uploads/settings/gcash/")) && homeownerPayHtml.includes(qrSetting.value) && homeownerPayHtml.includes("object-contain"), "homeowner payment page displays the stored QR without cropping");
  const qrImage = await get(qrSetting.value, homeownerToken);
  check(qrImage.status === 200 && qrImage.headers.get("content-type")?.startsWith("image/"), "stored GCash QR image is served successfully to homeowners");

  const homeownerBilling = await get("/portal/billing", homeownerToken);
  const homeownerBillingHtml = await homeownerBilling.text();
  check(homeownerBilling.status === 200 && homeownerBillingHtml.includes("Pay by QR"), "homeowner billing page links to Pay by QR");

  const adminPayments = await get("/admin/payments", adminToken);
  const adminPaymentsHtml = await adminPayments.text();
  check(adminPayments.status === 200 && adminPaymentsHtml.includes("QR / GCash payment requests"), "admin payments page includes QR request review");
  check(adminPaymentsHtml.includes("Payment amount") && adminPaymentsHtml.includes("Controlled amount update") && adminPaymentsHtml.includes("Void") && adminPaymentsHtml.includes("Transaction history (read only)"), "admin payment page renders editable amounts, void controls, and read-only archive history");

  const webhookNoSecret = await fetch(`${base}/api/payments/webhook/gcash`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "PAID" }), redirect: "manual" });
  check([401, 503].includes(webhookNoSecret.status), "payment webhook rejects untrusted calls");

  console.log(`PASS ${checks.length} system admin / QR checks`);
  for (const label of checks) console.log(`- ${label}`);
} finally {
  await prisma.$disconnect();
}
