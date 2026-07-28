import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { generatePasskeyRegistrationOptions } from "@/lib/services/passkeys";

export async function POST() {
  const user = await requireUser(Role.HOMEOWNER);
  const options = await generatePasskeyRegistrationOptions({
    tenantId: user.tenantId,
    userId: user.id,
    name: user.name,
    email: user.email,
  });
  return NextResponse.json(options);
}
