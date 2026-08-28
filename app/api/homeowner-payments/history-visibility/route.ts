import { Role } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { requireUser } from "@/lib/auth";
import { setHomeownerPaymentHistoryVisibility } from "@/lib/services/homeowner-payment-history-visibility";

export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(getAppUrl()).origin;
  } catch {
    return false;
  }
}

async function updateVisibility(request: Request, hidden: boolean) {
  if (!sameOrigin(request)) {
    return Response.json({ ok: false, message: "Invalid request origin." }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const user = await requireUser(Role.HOMEOWNER);
  if (!user.homeownerProfile) {
    return Response.json({ ok: false, message: "Homeowner profile not found." }, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const payload = await request.json().catch(() => null) as { requestId?: string } | null;
  const requestId = payload?.requestId?.trim() || "";
  if (!requestId) {
    return Response.json({ ok: false, message: "Payment history record is required." }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    await setHomeownerPaymentHistoryVisibility({
      tenantId: user.tenantId,
      homeownerId: user.homeownerProfile.id,
      actorId: user.id,
      requestId,
      hidden,
    });
    return Response.json({ ok: true }, {
      headers: { "Cache-Control": "no-store, private, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update payment history visibility.";
    return Response.json({ ok: false, message }, {
      status: message.includes("not found") ? 404 : 409,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function POST(request: Request) {
  return updateVisibility(request, true);
}

export async function DELETE(request: Request) {
  return updateVisibility(request, false);
}
