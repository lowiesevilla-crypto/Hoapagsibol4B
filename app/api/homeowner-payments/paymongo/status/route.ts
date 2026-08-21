import { Role } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { requireUser } from "@/lib/auth";
import { reconcilePendingHomeownerPayMongoPayments } from "@/lib/services/homeowner-paymongo-reconciliation";

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

export async function POST(request: Request) {
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

  const payments = await reconcilePendingHomeownerPayMongoPayments({
    tenantId: user.tenantId,
    homeownerId: user.homeownerProfile.id,
  });

  return Response.json({ ok: true, payments }, {
    headers: { "Cache-Control": "no-store, private, max-age=0" },
  });
}
