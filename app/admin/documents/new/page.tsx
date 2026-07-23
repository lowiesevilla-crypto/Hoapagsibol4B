import { ManualDocumentForm } from "@/components/manual-document-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveOrganizationOfficers } from "@/lib/organization";
import { getWalkInDocumentDefinitions, workflowPresetForDefinition } from "@/lib/services/document-definitions";
import { documentOutstandingBalancePolicyOptions } from "@/lib/services/document-balance-policy";
import { money } from "@/lib/utils";

export default async function NewAdminDocumentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const query = await searchParams; const [homeowners, officers, definitions] = await Promise.all([prisma.homeownerProfile.findMany({ where: { tenantId: user.tenantId, status: "ACTIVE" }, include: { user: true }, orderBy: { user: { name: "asc" } } }), getActiveOrganizationOfficers(user.tenantId), getWalkInDocumentDefinitions(user.tenantId)]);
  const choices = definitions.map((definition) => ({ id: definition.id, label: definition.displayName, workflow: workflowLabel(workflowPresetForDefinition(definition)), fee: Number(definition.feeAmount) > 0 ? money(Number(definition.feeAmount)) : "Free", balancePolicy: documentOutstandingBalancePolicyOptions.find((option) => option.value === definition.outstandingBalancePolicy)?.label || definition.outstandingBalancePolicy.replaceAll("_", " "), approvalRequired: definition.approvalRequired || definition.requiresAdminReview, walkInEnabled: definition.walkInEnabled, template: `Published v${definition.assignedTemplateVersion?.version ?? "?"}`, nextStep: nextStepForDefinition(definition) }));
  return <><PageHeader eyebrow="Resident services" title="Create Walk-In / Office Request" description="Create a tenant-scoped document request for an office-assisted transaction. The required steps depend on the selected document workflow, payment policy, and approval policy." />{query.error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{query.error}</div>}<ManualDocumentForm homeowners={homeowners.map((item) => ({ id: item.id, label: `${item.user.name} - Block ${item.block}, Lot ${item.lot}` }))} officers={officers.map((item) => ({ id: item.id, label: `${item.fullName} - ${item.position}` }))} definitions={choices} /></>;
}

function workflowLabel(value: string) { return value.replace("FREE_INSTANT", "Free + Instant").replace("FREE_APPROVAL", "Free + Approval").replace("PAID_INSTANT", "Paid + Instant").replace("PAID_APPROVAL", "Paid + Approval").replace("REQUEST_ONLY", "Request Only"); }
function nextStepForDefinition(definition: { deliveryMode: string; paymentRequired: boolean; approvalRequired: boolean; requiresAdminReview: boolean }) {
  if (definition.deliveryMode === "INSTANT_DOWNLOAD") return "Generate Document";
  if (definition.paymentRequired) return "Create Payment-Pending Request";
  if (definition.approvalRequired || definition.requiresAdminReview) return "Submit for Approval";
  return "Create Request";
}
