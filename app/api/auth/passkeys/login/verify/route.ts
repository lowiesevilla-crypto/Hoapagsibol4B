import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { PasskeyAuthenticationError, verifyPasskeyAuthentication } from "@/lib/services/passkeys";
import { runWithTenant } from "@/lib/tenant-context";

const DISCOVERY_CHALLENGE_COOKIE = "hoa_passkey_login_challenge";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { response?: AuthenticationResponseJSON; tenantSlug?: string } | null;
  if (!body?.response) return NextResponse.json({ error: "Passkey authentication response is required." }, { status: 400 });

  const store = await cookies();
  const discoveryChallengeHash = store.get(DISCOVERY_CHALLENGE_COOKIE)?.value;
  try {
    const session = await verifyPasskeyAuthentication({
      response: body.response,
      discoveryChallengeHash,
      expectedTenantSlug: String(body.tenantSlug || "").trim() || undefined,
    });
    await runWithTenant(session.tenantId, () => createSession(session), { role: session.role });
    const response = NextResponse.json({ ok: true, redirectTo: "/portal/dashboard" });
    response.cookies.delete(DISCOVERY_CHALLENGE_COOKIE);
    return response;
  } catch (error) {
    const message = error instanceof PasskeyAuthenticationError
      ? error.message
      : "Passkey authentication could not be verified.";
    const response = NextResponse.json({ error: message }, { status: 400 });
    response.cookies.delete(DISCOVERY_CHALLENGE_COOKIE);
    return response;
  }
}
