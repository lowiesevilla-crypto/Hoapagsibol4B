import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const prisma = new PrismaClient();
const base = "http://localhost:3000";
const output = path.join(process.cwd(), "tmp", "payment-coverage-reports");
const env = await readFile(new URL("../.env", import.meta.url), "utf8");
const authSecret = env.match(/^AUTH_SECRET="?([^"\r\n]+)"?/m)?.[1];
if (!authSecret) throw new Error("AUTH_SECRET not found.");

function check(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  console.log(`PASS: ${label}`);
}

try {
  const [admin, samplePayment] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: { in: ["SYSTEM_ADMIN", "ADMIN"] } }, include: { tenant: true }, orderBy: { role: "asc" } }),
    prisma.payment.findFirstOrThrow({ where: { status: "ACTIVE" }, orderBy: { paymentDate: "desc" } }),
  ]);
  const token = await new SignJWT({ userId: admin.id, role: admin.role, tenantId: admin.tenantId, tenantSlug: admin.tenant.slug }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(authSecret));
  const headers = { Cookie: `hoa_session=${token}` };
  const reportYear = samplePayment.paymentDate.getUTCFullYear();
  const query = `from=${reportYear}-01-01&to=${reportYear}-12-31`;
  await mkdir(output, { recursive: true });

  const page = await fetch(`${base}/admin/reports?${query}`, { headers });
  const html = await page.text();
  await writeFile(path.join(output, "report-page.html"), html);
  check(page.status === 200, "financial report page returns HTTP 200");
  check(html.includes("HOA financial reports"), "authenticated Admin financial report content is rendered");
  check(html.includes("Monthly dues collection summary"), "financial report page includes the monthly dues detail table");
  check(html.includes("Payment Coverage"), "financial report page includes the Payment Coverage column");
  check(html.includes(samplePayment.paymentCoverageDisplay?.replace(/^Monthly Dues\s*-\s*/i, "") || "Previous Balance / Migrated Balance"), "financial report page includes stored payment coverage");

  const csvResponse = await fetch(`${base}/admin/reports/export`, { headers });
  const csv = await csvResponse.text();
  check(csvResponse.status === 200 && csv.includes('"Payment Coverage"'), "CSV financial export includes the Payment Coverage column");
  check(csv.includes(samplePayment.paymentCoverageDisplay || "Monthly Dues - Previous Balance / Migrated Balance"), "CSV financial export includes stored payment coverage");
  await writeFile(path.join(output, "financial-transactions.csv"), csv);

  const pdfResponse = await fetch(`${base}/admin/reports/pdf?${query}`, { headers });
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  check(pdfResponse.status === 200 && pdfResponse.headers.get("content-type") === "application/pdf" && pdf.subarray(0, 5).toString() === "%PDF-", "financial PDF report is valid");
  await writeFile(path.join(output, "financial-report.pdf"), pdf);

  const docxResponse = await fetch(`${base}/admin/reports/docx?${query}`, { headers });
  const docx = Buffer.from(await docxResponse.arrayBuffer());
  check(docxResponse.status === 200 && docxResponse.headers.get("content-type")?.includes("wordprocessingml") && docx.subarray(0, 2).toString() === "PK", "financial Word report is a valid DOCX package");
  await writeFile(path.join(output, "financial-report.docx"), docx);
  console.log(`REPORT_ARTIFACTS=${output}`);
} finally {
  await prisma.$disconnect();
}
