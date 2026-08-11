import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { ResidentAiAssistant } from "@/components/ai/resident-ai-assistant";
import { defaultHomeForRoles, requireUser } from "@/lib/auth";
import { manilaDayPeriod } from "@/lib/utils";

function greetingFor(name: string | null | undefined) {
  const firstName = name?.trim().split(/\s+/)[0];
  return `Good ${manilaDayPeriod().toLowerCase()}${firstName ? `, ${firstName}` : ""}. How can I help you today?`;
}

export default async function PortalAiPage() {
  const user = await requireUser();
  if (!user.roles.includes(Role.HOMEOWNER)) redirect(defaultHomeForRoles(user.roles, user.role));

  return <div className="space-y-4 sm:space-y-5">
    <div className="hidden sm:block">
      <p className="text-xs font-black uppercase tracking-[.16em] text-indigo-700">HOAHub Community AI</p>
      <h1 className="mt-1 text-3xl font-black text-slate-950">Association Assistant</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Ask about approved HOA knowledge, document requirements, community services, and your own authorized account records.</p>
    </div>
    <ResidentAiAssistant initialGreeting={greetingFor(user.name)} />
  </div>;
}
