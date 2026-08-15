import { Role } from "@prisma/client";
import { ChatMessenger } from "@/components/chat-messenger";
import { HomeownerChatPrivacyPanel } from "@/components/homeowner-chat-privacy-panel";
import { requireUser } from "@/lib/auth";
import { getChatPayload } from "@/lib/services/chat";
import { getChatPrivacySnapshot } from "@/lib/services/chat-privacy";

export default async function PortalChatPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const user = await requireUser(Role.HOMEOWNER);
  const { conversation } = await searchParams;
  const [data, privacy] = await Promise.all([
    getChatPayload(user, conversation),
    getChatPrivacySnapshot(user.tenantId, user.id),
  ]);

  return <>
    <HomeownerChatPrivacyPanel initialData={privacy} />
    <ChatMessenger
      basePath="/portal/chat"
      title="Messages"
      description="Chat with verified HOA officials or other residents. New resident contacts follow your privacy preference and may arrive as Message Requests."
      initialData={data}
    />
  </>;
}
