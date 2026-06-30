import { Role } from "@prisma/client";
import { ChatMessenger } from "@/components/chat-messenger";
import { requireUser } from "@/lib/auth";
import { getChatPayload } from "@/lib/services/chat";

export default async function EmployeeChatPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const user = await requireUser(Role.EMPLOYEE);
  const { conversation } = await searchParams;
  const data = await getChatPayload(user, conversation);

  return <ChatMessenger
    basePath="/employee/chat"
    title="Employee Messages"
    description="Coordinate attendance questions, HOA support, resident replies, and document attachments in one secured message history."
    initialData={data}
  />;
}
