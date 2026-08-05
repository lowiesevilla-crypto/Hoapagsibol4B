import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";

import { NextResponse } from "next/server";

import { PASSKEY_DOMAIN_CONFIGURATION_ERROR, generatePasskeyRegistrationOptions } from "@/lib/services/passkeys";

export async function POST() {
  const user = await requirePermission(Permission.HOMEOWNER_PORTAL_ACCESS);
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
