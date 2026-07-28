import { NextResponse } from "next/server";
import { findPasskeyLoginUser, generatePasskeyAuthenticationOptions } from "@/lib/services/passkeys";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string; accountNumber?: string; tenantSlug?: string } | null;
  if (!body?.email) return NextResponse.json({ error: "Registered email is required." }, { status: 400 });
  const resolved = await findPasskeyLoginUser({ email: body.email, accountNumber: body.accountNumber, tenantSlug: body.tenantSlug });
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });
  const options = await generatePasskeyAuthenticationOptions({
    tenantId: resolved.user.tenantId,
    userId: resolved.user.id,
  });
  return NextResponse.json(options);
}
