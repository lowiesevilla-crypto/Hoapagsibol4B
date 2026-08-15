import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getChatPrivacySnapshot, setResidentBlock } from "@/lib/services/chat-privacy";

export async function POST(request: Request) {
  const user = await requireUser(Role.HOMEOWNER);
  const body = await request.json().catch(() => ({}));
  const targetUserId = String(body.userId || "");
  const action = String(body.action || "").toUpperCase();
  if (!targetUserId || (action !== "BLOCK" && action !== "UNBLOCK")) {
    return NextResponse.json({ error: "Choose a resident and Block or Unblock." }, { status: 400 });
  }
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, tenantId: user.tenantId, role: Role.HOMEOWNER, active: true },
    select: { id: true },
  });
  if (!target || target.id === user.id) return NextResponse.json({ error: "Resident not found." }, { status: 404 });
  await setResidentBlock(user.tenantId, user.id, target.id, action === "BLOCK");
  await writeAuditLog({ actorId: user.id, module: "CHAT", action: action === "BLOCK" ? "BLOCK_RESIDENT_CHAT" : "UNBLOCK_RESIDENT_CHAT", entityType: "User", entityId: target.id });
  return NextResponse.json(await getChatPrivacySnapshot(user.tenantId, user.id));
}
