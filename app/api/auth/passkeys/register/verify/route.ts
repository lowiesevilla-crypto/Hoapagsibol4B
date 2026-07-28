import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { verifyPasskeyRegistration } from "@/lib/services/passkeys";

export async function POST(request: Request) {
  const user = await requireUser(Role.HOMEOWNER);
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
  } catch {
    return NextResponse.json({ error: "Passkey registration could not be verified." }, { status: 400 });
  }
}
