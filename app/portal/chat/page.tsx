import { Role } from "@prisma/client";
import { ChatMessenger } from "@/components/chat-messenger";
import { requireUser } from "@/lib/auth";
import { getChatPayload } from "@/lib/services/chat";

export default async function PortalChatPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const user = await requireUser(Role.HOMEOWNER);
  const { conversation } = await searchParams;
  const data = await getChatPayload(user, conversation);

  return <ChatMessenger
    basePath="/portal/chat"
    title="Message the HOA"
    description="Send questions, requests, proof files, images, PDFs, and documents to HOA personnel in a modern messaging workspace."
    initialData={data}
  />;
}
