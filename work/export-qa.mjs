import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose/jwt/sign";

const prisma = new PrismaClient();
try {
  const envText = await readFile(new URL("../.env", import.meta.url), "utf8");
  const authSecret = envText.match(/^AUTH_SECRET="?([^"\r\n]+)"?/m)?.[1];
  if (!authSecret) throw new Error("AUTH_SECRET not found");
  const admin = await prisma.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId: "tenant_pagsibol4b_default", email: "admin@greenmeadows.test" } }, include: { tenant: true } });
  const token = await new SignJWT({ userId: admin.id, role: admin.role, tenantId: admin.tenantId, tenantSlug: admin.tenant.slug }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(authSecret));
  const headers = { Cookie: `hoa_session=${token}` };
  const [pdf, docx] = await Promise.all([
    fetch("http://localhost:3000/admin/reports/pdf?from=2026-01-01&to=2026-12-31", { headers }),
    fetch("http://localhost:3000/admin/reports/docx?from=2026-01-01&to=2026-12-31", { headers }),
  ]);
  if (!pdf.ok || !docx.ok) throw new Error(`Export request failed: PDF ${pdf.status}, Word ${docx.status}`);
  await mkdir("tmp/pdfs", { recursive: true });
  await mkdir("tmp/docx", { recursive: true });
  await writeFile("tmp/pdfs/pagsibol-financial-report.pdf", Buffer.from(await pdf.arrayBuffer()));
  await writeFile("tmp/docx/pagsibol-financial-report.docx", Buffer.from(await docx.arrayBuffer()));
  console.log("Saved PDF and Word exports for visual QA.");
} finally {
  await prisma.$disconnect();
}
