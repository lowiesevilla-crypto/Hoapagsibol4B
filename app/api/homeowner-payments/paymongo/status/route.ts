import { Role } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPayMongoCanonicalEvidence } from "@/lib/services/paymongo-canonical-evidence";
import {
  reconcileHomeownerPayMongoCheckout,
  reconcilePendingHomeownerPayMongoPayments,
} from "@/lib/services/homeowner-paymongo-reconciliation";

export const dynamic = "force-dynamic";

const HOMEOWNER_HIDE_ACTION = "HOMEOWNER_HIDE_PAYMONGO_HISTORY";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(getAppUrl()).origin;
  } catch {
    return false;
  }
}

function noStore(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private, max-age=0" },
  });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return noStore(403, { ok: false, message: "Invalid request origin." });

  const user = await requireUser(Role.HOMEOWNER);
  if (!user.homeownerProfile) return noStore(404, { ok: false, message: "Homeowner profile not found." });

  const payments = await reconcilePendingHomeownerPayMongoPayments({
    tenantId: user.tenantId,
    homeownerId: user.homeownerProfile.id,
  });
  const withEvidence = await Promise.all(payments.map(async (payment) => {
    const evidence = await getPayMongoCanonicalEvidence({
      requestId: payment.requestId,
      tenantId: user.tenantId,
      homeownerId: user.homeownerProfile!.id,
    });
    return {
      ...payment,
      financeStatus: evidence.reconciled ? "RECONCILED" as const : "NOT_POSTED" as const,
      receipts: evidence.receipts,
    };
  }));
  const requestIds = withEvidence.map((payment) => payment.requestId);
  const hidden = requestIds.length
    ? await prisma.auditLog.findMany({
        where: {
          tenantId: user.tenantId,
          actorId: user.id,
          module: "PAYMENTS",
          action: HOMEOWNER_HIDE_ACTION,
          entityType: "PaymentRequest",
          entityId: { in: requestIds },
          correlationId: user.homeownerProfile.id,
        },
        select: { entityId: true },
      })
    : [];
  const hiddenIds = new Set(hidden.map((row) => row.entityId).filter(Boolean));

  return noStore(200, {
    ok: true,
    payments: withEvidence.filter((payment) => !hiddenIds.has(payment.requestId)),
  });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return noStore(403, { ok: false, message: "Invalid request origin." });

  const user = await requireUser(Role.HOMEOWNER);
  if (!user.homeownerProfile) return noStore(404, { ok: false, message: "Homeowner profile not found." });

  const payload = await request.json().catch(() => null) as { requestId?: unknown } | null;
  const requestId = typeof payload?.requestId === "string" ? payload.requestId.trim() : "";
  if (!requestId) return noStore(400, { ok: false, message: "Payment history item is required." });

  let payment;
  try {
    payment = await reconcileHomeownerPayMongoCheckout({
      requestId,
      tenantId: user.tenantId,
      homeownerId: user.homeownerProfile.id,
    });
  } catch {
    return noStore(404, { ok: false, message: "Online payment history item was not found." });
  }
  if (!payment.terminal) {
    return noStore(409, {
      ok: false,
      message: "Only completed, cancelled, expired, or failed payment attempts can be removed from your visible history.",
    });
  }

  const evidence = await getPayMongoCanonicalEvidence({
    requestId: payment.requestId,
    tenantId: user.tenantId,
    homeownerId: user.homeownerProfile.id,
  });
  const financeStatus = evidence.reconciled ? "RECONCILED" : "NOT_POSTED";

  const existing = await prisma.auditLog.findFirst({
    where: {
      tenantId: user.tenantId,
      actorId: user.id,
      module: "PAYMENTS",
      action: HOMEOWNER_HIDE_ACTION,
      entityType: "PaymentRequest",
      entityId: payment.requestId,
      correlationId: user.homeownerProfile.id,
    },
    select: { id: true },
  });

  if (!existing) {
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "PAYMENTS",
        action: HOMEOWNER_HIDE_ACTION,
        entityType: "PaymentRequest",
        entityId: payment.requestId,
        correlationId: user.homeownerProfile.id,
        metadata: {
          homeownerId: user.homeownerProfile.id,
          gatewayState: payment.state,
          financeStatus,
          semantics: "HOMEOWNER_VISIBILITY_ONLY",
          retainedEvidence: true,
        },
      },
    });
  }

  return noStore(200, {
    ok: true,
    message: "Removed from your online payment status history. Official payment, receipt, reconciliation, and audit records are retained.",
  });
}
