import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { verifyPasskeyAuthentication } from "@/lib/services/passkeys";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { response?: AuthenticationResponseJSON } | null;
  if (!body?.response) return NextResponse.json({ error: "Passkey authentication response is required." }, { status: 400 });
  try {
    const session = await verifyPasskeyAuthentication({ response: body.response });
    await createSession(session);
    return NextResponse.json({ ok: true, redirectTo: "/portal/dashboard" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Passkey authentication could not be verified." }, { status: 400 });
  }
}
