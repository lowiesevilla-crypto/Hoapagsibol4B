import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const prisma = new PrismaClient();
const base = "http://localhost:3000";
const env = await readFile(new URL("../.env", import.meta.url), "utf8");
const authSecret = env.match(/^AUTH_SECRET="?([^"\r\n]+)"?/m)?.[1];
if (!authSecret) throw new Error("AUTH_SECRET not found.");

function check(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  console.log(`PASS: ${label}`);
}

function coverageLabel(payment) {
  const stored = Array.isArray(payment.coverageMonths) ? payment.coverageMonths : [];
  const values = stored.length ? stored : [payment.coverageStart, payment.coverageEnd, payment.bill.billingMonth];
  const months = [...new Map(values.filter(Boolean).map((value) => {
    const date = new Date(value);
    const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    return [month.toISOString().slice(0, 10), month];
  })).values()].sort((left, right) => left.valueOf() - right.valueOf());
  const format = (date) => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  return months.length === 1 ? format(months[0]) : `${format(months[0])} to ${format(months.at(-1))}`;
}

try {
  const [admin, payments] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: { in: ["SYSTEM_ADMIN", "ADMIN"] } }, include: { tenant: true }, orderBy: { role: "asc" } }),
    prisma.payment.findMany({ where: { status: "ACTIVE" }, include: { bill: true }, orderBy: { paymentDate: "desc" }, take: 5 }),
  ]);
  check(payments.length > 0, "an active payment is available for receipt verification");
  const token = await new SignJWT({ userId: admin.id, role: admin.role, tenantId: admin.tenantId, tenantSlug: admin.tenant.slug })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(authSecret));
  const headers = { Cookie: `hoa_session=${token}` };

  for (const payment of payments) {
    const expectedCoverage = coverageLabel(payment);
    const receipt = await fetch(`${base}/receipts/payment/${payment.id}`, { headers });
    const html = await receipt.text();
    check(receipt.status === 200 && html.includes("Payment For") && html.includes(expectedCoverage), `receipt HTML displays ${expectedCoverage}`);

    const pdf = await fetch(`${base}/receipts/payment/${payment.id}/pdf`, { headers });
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    const signature = new TextDecoder().decode(bytes.slice(0, 5));
    check(pdf.status === 200 && pdf.headers.get("content-type") === "application/pdf" && signature === "%PDF-", `receipt PDF is valid for ${expectedCoverage}`);
    check(pdf.headers.get("content-disposition")?.includes("attachment; filename=") === true, "receipt PDF is downloadable as an attachment");
  }
} finally {
  await prisma.$disconnect();
}

console.log("RECEIPT_PDF_VERIFICATION_COMPLETE");
