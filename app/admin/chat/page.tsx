import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";

import { ChatMessenger } from "@/components/chat-messenger";

import { getChatPayload } from "@/lib/services/chat";

export default async function AdminChatPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const user = await requirePermission(Permission.CHAT_USE);
  const { conversation } = await searchParams;
  const data = await getChatPayload(user, conversation);

  return <ChatMessenger
    basePath="/admin/chat"
    title="HOA Chat Center"
    description="Communicate with homeowners and HOA personnel using searchable conversations, online status, attachments, replies, unread badges, and audit-safe message history."
    initialData={data}
  />;
}
