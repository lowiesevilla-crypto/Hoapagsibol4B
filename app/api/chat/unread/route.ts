import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUnreadChatCount } from "@/lib/services/chat";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json({ unreadCount: await getUnreadChatCount(user.id) });
}
