import { NextResponse } from "next/server";
import { PASSKEY_DOMAIN_CONFIGURATION_ERROR, findPasskeyLoginUser, generatePasskeyAuthenticationOptions, generatePasskeyDiscoveryAuthenticationOptions, passkeyChallengeHash } from "@/lib/services/passkeys";

const DISCOVERY_CHALLENGE_COOKIE = "hoa_passkey_login_challenge";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { identifier?: string; email?: string; accountNumber?: string; tenantSlug?: string } | null;
  const identifier = String(body?.identifier || "").trim();
  try {
    if (!identifier) {
      const options = await generatePasskeyDiscoveryAuthenticationOptions();
      const response = NextResponse.json(options);
      response.cookies.set(DISCOVERY_CHALLENGE_COOKIE, passkeyChallengeHash(options.challenge), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 5 * 60,
      });
      return response;
    }
    const resolved = await findPasskeyLoginUser({ identifier, email: body?.email, accountNumber: body?.accountNumber, tenantSlug: body?.tenantSlug });
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });
    const options = await generatePasskeyAuthenticationOptions({
      tenantId: resolved.user.tenantId,
      userId: resolved.user.id,
    });
    return NextResponse.json(options);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === PASSKEY_DOMAIN_CONFIGURATION_ERROR ? error.message : "Could not start passkey login." }, { status: 400 });
  }
}
