import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const prisma = new PrismaClient();
const base = "http://localhost:3000";
const env = await readFile(new URL("../.env", import.meta.url), "utf8");
const authSecret = env.match(/^AUTH_SECRET="?([^"\r\n]+)"?/m)?.[1];
if (!authSecret) throw new Error("AUTH_SECRET not found.");
const secret = new TextEncoder().encode(authSecret);
const passed = [];

function check(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed.push(label);
}

async function tokenFor(user) {
  return new SignJWT({ userId: user.id, role: user.role }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(secret);
}

async function page(path, token, expected) {
  const response = await fetch(`${base}${path}`, { headers: { Cookie: `hoa_session=${token}` } });
  const body = await response.text();
  check(response.status === 200, `${path} returns HTTP 200`);
  check(body.includes(expected), `${path} renders ${expected}`);
}

try {
  const [admin, homeowner, employee] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: { in: ["ADMIN", "SYSTEM_ADMIN"] } }, orderBy: { role: "asc" } }),
    prisma.user.findFirstOrThrow({ where: { role: "HOMEOWNER", homeownerProfile: { isNot: null } } }),
    prisma.user.findFirstOrThrow({ where: { role: "EMPLOYEE", employeeProfile: { isNot: null } } }),
  ]);
  const [adminToken, homeownerToken, employeeToken] = await Promise.all([tokenFor(admin), tokenFor(homeowner), tokenFor(employee)]);

  const login = await fetch(`${base}/login`);
  check(login.status === 200, "login page returns HTTP 200");

  for (const [path, expected] of [
    ["/admin/dashboard", "Admin dashboard"],
    ["/admin/attendance", "Attendance dashboard"],
    ["/admin/attendance/add", "Add attendance record"],
    ["/admin/attendance/history", "Employee attendance history"],
    ["/admin/attendance/corrections/approval", "Attendance correction approval"],
    ["/admin/attendance/review", "Payroll manager attendance review"],
    ["/admin/payroll", "Payroll &amp; payslips"],
    ["/admin/payroll/computation", "Calculate payroll period"],
    ["/admin/payroll/overtime", "OT request / manager adjustment"],
    ["/admin/payroll/archive", "Payroll archive / deleted payroll history"],
    ["/admin/billing", "Billing management"],
    ["/admin/payments", "Payment tracking"],
    ["/admin/announcements", "Announcements"],
    ["/admin/events", "Events and activities"],
    ["/admin/chat", "HOA Chat Center"],
  ]) await page(path, adminToken, expected);

  for (const [path, expected] of [
    ["/employee/attendance", "Attendance dashboard"],
    ["/employee/attendance/correction", "Attendance correction request"],
    ["/employee/attendance/history", "My attendance history"],
    ["/employee/chat", "Employee Messages"],
  ]) await page(path, employeeToken, expected);

  for (const [path, expected] of [
    ["/portal/dashboard", "Homeowner portal"],
    ["/portal/billing", "Billing history"],
    ["/portal/pay", "Submit QR payment"],
    ["/portal/payments", "Payment and receipt history"],
    ["/portal/announcements", "Announcements"],
    ["/portal/events", "Upcoming events"],
    ["/portal/chat", "Message the HOA"],
  ]) await page(path, homeownerToken, expected);

  const blocked = await fetch(`${base}/admin/payroll`, { headers: { Cookie: `hoa_session=${homeownerToken}` }, redirect: "manual" });
  check([307, 308].includes(blocked.status), "homeowner is blocked from payroll");
  const chatApi = await fetch(`${base}/api/chat`, { headers: { Cookie: `hoa_session=${adminToken}` } });
  check(chatApi.status === 200, "chat API returns HTTP 200");
  const unreadApi = await fetch(`${base}/api/chat/unread`, { headers: { Cookie: `hoa_session=${adminToken}` } });
  const unreadPayload = await unreadApi.json();
  check(unreadApi.status === 200 && Number.isInteger(unreadPayload.unreadCount), "chat unread API returns an integer count");

  console.log(`PASS ${passed.length} smoke checks`);
  for (const label of passed) console.log(`- ${label}`);
} finally {
  await prisma.$disconnect();
}
