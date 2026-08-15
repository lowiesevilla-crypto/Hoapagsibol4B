import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getChatPrivacySnapshot, setResidentMessagingMode, type ResidentMessagingMode } from "@/lib/services/chat-privacy";

const allowedModes = new Set<ResidentMessagingMode>(["INBOX", "REQUESTS", "NONE"]);

export async function GET() {
  const user = await requireUser(Role.HOMEOWNER);
  return NextResponse.json(await getChatPrivacySnapshot(user.tenantId, user.id));
}

export async function PATCH(request: Request) {
  const user = await requireUser(Role.HOMEOWNER);
  const body = await request.json().catch(() => ({}));
  const mode = String(body.residentMessagingMode || "") as ResidentMessagingMode;
  if (!allowedModes.has(mode)) return NextResponse.json({ error: "Choose a valid resident messaging preference." }, { status: 400 });
  await setResidentMessagingMode(user.tenantId, user.id, mode);
  await writeAuditLog({ actorId: user.id, module: "CHAT", action: "UPDATE_RESIDENT_MESSAGING_PRIVACY", entityType: "User", entityId: user.id, metadata: { mode } });
  return NextResponse.json(await getChatPrivacySnapshot(user.tenantId, user.id));
}
