import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { PASSKEY_DOMAIN_CONFIGURATION_ERROR, generatePasskeyRegistrationOptions } from "@/lib/services/passkeys";

export async function POST() {
  const user = await requireUser(Role.HOMEOWNER);
  try {
    const options = await generatePasskeyRegistrationOptions({
      tenantId: user.tenantId,
      userId: user.id,
      name: user.name,
      email: user.email,
    });
    return NextResponse.json(options);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === PASSKEY_DOMAIN_CONFIGURATION_ERROR ? error.message : "Could not start passkey registration." }, { status: 400 });
  }
}
