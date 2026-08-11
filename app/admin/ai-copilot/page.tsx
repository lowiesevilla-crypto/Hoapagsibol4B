import { Role } from "@prisma/client";
import Link from "next/link";
import { ResidentAiAssistant } from "@/components/ai/resident-ai-assistant";
import { resolveAiAssistanceEntitlement } from "@/lib/ai-assistance/entitlement";
import { evaluateAiGovernance } from "@/lib/ai-assistance/runtime-policy";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { manilaDayPeriod } from "@/lib/utils";

function greetingFor(name: string | null | undefined) {
  const firstName = name?.trim().split(/\s+/)[0];
  return `Good ${manilaDayPeriod().toLowerCase()}${firstName ? `, ${firstName}` : ""}. How can I help with HOA operations today?`;
}

export default async function AdminAiCopilotPage() {
  const user = await requireUser(Role.ADMIN);
  const [entitlement, governance] = await Promise.all([
    resolveAiAssistanceEntitlement(user.tenantId),
    prisma.tenantAiConfiguration.findUnique({ where: { tenantId: user.tenantId } }),
  ]);
  const decision = evaluateAiGovernance({
    globalRuntimeEnabled: process.env.AI_RUNTIME_ENABLED === "true",
    commerciallyEnabled: entitlement.enabled,
    experience: "STAFF",
    governance,
  });

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[.16em] text-indigo-700">HOAHub Staff AI</p>
        <h1 className="mt-1 text-3xl font-black text-slate-950">Staff Copilot</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Ask tenant-scoped questions about finance, residents, documents, policies, workflows, reports, and administrative drafts. Answers remain limited by your role permissions and HOAHub source controls.</p>
      </div>
      <Link className="btn-secondary" href="/admin/ai-assistance">AI settings</Link>
    </div>

    {!decision.allowed && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
      Staff Copilot is gated right now: {decision.reason}. Enable Staff Copilot and complete AI governance controls before using this page.
    </section>}

    {decision.allowed && <ResidentAiAssistant
      endpoint="/api/admin/ai/ask"
      headerTitle="Ask Staff Copilot"
      headerDescription="Answers use tenant records, authorized admin modules, and approved knowledge sources according to your permissions."
      emptyTitle="Ask an administrative question"
      emptyDescription="Start with finance totals, resident lists, document/policy questions, workflow guidance, or a draft resolution."
      placeholder="Ask about collections, finance, residents, documents, policies, reports, or draft a resolution..."
      suggestions={[
        "What is my total collection today?",
        "Give the list of active homeowners in Block 1",
        "Give me a finance summary",
        "Draft a board resolution for monthly dues collection policy",
      ]}
      initialGreeting={greetingFor(user.name)}
      rulesTitle="What Staff Copilot does"
      rules={[
        "Answers finance and resident questions only when your role has the required permission.",
        "Uses the authenticated tenant only; prompt text cannot switch tenants.",
        "Explains documents and policies from authorized tenant knowledge sources.",
        "Creates drafts for human review, but never approves, rejects, posts, or publishes final actions by itself.",
      ]}
    />}
  </div>;
}
