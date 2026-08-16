import { Role } from "@prisma/client";
import { HomeownerMessenger } from "@/components/homeowner-messenger";
import { HomeownerChatPrivacyPanel } from "@/components/homeowner-chat-privacy-panel";
import { requireUser } from "@/lib/auth";
import { getChatPayload } from "@/lib/services/chat";
import { getChatPrivacySnapshot } from "@/lib/services/chat-privacy";
import { sanitizeHomeownerChatPayload } from "@/lib/services/homeowner-chat-view";

export default async function PortalChatPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const user = await requireUser(Role.HOMEOWNER);
  const { conversation } = await searchParams;
  const [rawData, privacy] = await Promise.all([
    getChatPayload(user, conversation),
    getChatPrivacySnapshot(user.tenantId, user.id),
  ]);
  const data = sanitizeHomeownerChatPayload(rawData);

  return <div className="mx-auto w-full max-w-7xl space-y-3">
    <HomeownerMessenger initialData={data} />
    <details className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-slate-800 [&::-webkit-details-marker]:hidden">
        <span>Message privacy</span>
        <span className="text-xs font-bold text-pine-700 group-open:hidden">Open</span>
        <span className="hidden text-xs font-bold text-pine-700 group-open:inline">Close</span>
      </summary>
      <div className="border-t border-slate-100 p-3"><HomeownerChatPrivacyPanel initialData={privacy} /></div>
    </details>
  </div>;
}
