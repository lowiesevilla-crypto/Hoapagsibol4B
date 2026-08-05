import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";

import { ChatMessenger } from "@/components/chat-messenger";

import { getChatPayload } from "@/lib/services/chat";

export default async function PortalChatPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const user = await requirePermission(Permission.CHAT_USE);
  const { conversation } = await searchParams;
  const data = await getChatPayload(user, conversation);

  return <ChatMessenger
    basePath="/portal/chat"
    title="Message the HOA"
    description="Send questions, requests, proof files, images, PDFs, and documents to HOA personnel in a modern messaging workspace."
    initialData={data}
  />;
}
