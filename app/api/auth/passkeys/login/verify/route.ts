import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { verifyPasskeyAuthentication } from "@/lib/services/passkeys";

const DISCOVERY_CHALLENGE_COOKIE = "hoa_passkey_login_challenge";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { response?: AuthenticationResponseJSON } | null;
  if (!body?.response) return NextResponse.json({ error: "Passkey authentication response is required." }, { status: 400 });
  try {
    const store = await cookies();
    const discoveryChallengeHash = store.get(DISCOVERY_CHALLENGE_COOKIE)?.value;
    const session = await verifyPasskeyAuthentication({ response: body.response, discoveryChallengeHash });
    await createSession(session);
    const response = NextResponse.json({ ok: true, redirectTo: "/portal/dashboard" });
    response.cookies.delete(DISCOVERY_CHALLENGE_COOKIE);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Passkey authentication could not be verified." }, { status: 400 });
  }
}
