import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import { NextResponse } from "next/server";

import { PASSKEY_DOMAIN_CONFIGURATION_ERROR, verifyPasskeyRegistration } from "@/lib/services/passkeys";

export async function POST(request: Request) {
  const user = await requirePermission(Permission.HOMEOWNER_PORTAL_ACCESS);
  const body = await request.json().catch(() => null) as { response?: RegistrationResponseJSON; deviceName?: string } | null;
  if (!body?.response) return NextResponse.json({ error: "Passkey registration response is required." }, { status: 400 });
  try {
    await verifyPasskeyRegistration({
      tenantId: user.tenantId,
      userId: user.id,
      response: body.response,
      deviceName: body.deviceName,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === PASSKEY_DOMAIN_CONFIGURATION_ERROR ? error.message : "Passkey registration could not be verified." }, { status: 400 });
  }
}
