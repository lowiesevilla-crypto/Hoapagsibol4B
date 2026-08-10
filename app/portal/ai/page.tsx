import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { ResidentAiAssistant } from "@/components/ai/resident-ai-assistant";
import { defaultHomeForRoles, requireUser } from "@/lib/auth";

export default async function PortalAiPage() {
  const user = await requireUser();
  if (!user.roles.includes(Role.HOMEOWNER)) redirect(defaultHomeForRoles(user.roles, user.role));

  return <div className="space-y-5">
    <div><p className="text-xs font-black uppercase tracking-[.16em] text-indigo-700">HOAHub Community AI</p><h1 className="mt-1 text-3xl font-black text-slate-950">Association Assistant</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Ask questions grounded in your association’s approved resident knowledge. Tenant, role, publication, privacy, lifecycle and AI-policy checks are enforced before retrieval.</p></div>
    <ResidentAiAssistant />
  </div>;
}
