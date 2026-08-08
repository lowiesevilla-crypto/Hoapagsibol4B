import { AgreementAuditEventType, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { platformPrisma } from "@/lib/db";
import { getAgreementDocument, renderAgreementPdf } from "@/lib/services/platform-agreement-document";
import { tenantAgreementAdminRoleAllowed } from "@/lib/services/platform-agreements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ agreementId: string }> }) {
  const user = await requireUser();
  const { agreementId } = await params;
  const agreement = await getAgreementDocument(agreementId);
  if (!agreement) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });

  const platform = user.roles.includes(Role.SUPER_ADMIN) || user.roles.includes(Role.PLATFORM_ADMIN);
  const tenantAdmin = agreement.tenantId === user.tenantId && tenantAgreementAdminRoleAllowed(user.roles);
  if (!platform && !tenantAdmin) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });

  const pdf = await renderAgreementPdf(agreement);
  const safeNumber = agreement.agreementNumber.replace(/[^A-Za-z0-9_-]/g, "-");
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  await platformPrisma.agreementAuditEvent.create({
    data: {
      agreementId: agreement.id,
      tenantId: agreement.tenantId,
      eventType: AgreementAuditEventType.DOWNLOADED,
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: forwardedFor || request.headers.get("x-real-ip") || null,
      userAgent: request.headers.get("user-agent") || null,
      metadata: { accessType: platform ? "PLATFORM" : "TENANT_ADMIN" },
    },
  }).catch(() => undefined);

  return new Response(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="HOAHub-Agreement-${safeNumber}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
