import { Role, TenantModule } from "@prisma/client";
import { FileCheck2, FileQuestion, MessageSquarePlus, ShieldCheck } from "lucide-react";
import { PortalEmptyState, PortalPageContainer, PortalQuickActionTile, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { requireUser } from "@/lib/auth";
import { resolveHomeownerNavigation } from "@/lib/homeowner-navigation";
import { getEnabledTenantModules } from "@/lib/tenant";

export default async function PortalRequestsPage() {
  const user = await requireUser(Role.HOMEOWNER);
  const enabledModules = await getEnabledTenantModules(user.tenantId);
  const navigation = resolveHomeownerNavigation(enabledModules);
  const documentLink = navigation.requestLinks.find((link) => link.module === TenantModule.DOCUMENTS);
  const complaintLink = navigation.requestLinks.find((link) => link.href === "/portal/complaints");
  const newComplaintLink = navigation.requestLinks.find((link) => link.href === "/portal/complaints/new");
  const actions = [
    documentLink && {
      href: documentLink.href,
      label: documentLink.label,
      description: documentLink.description,
      icon: FileQuestion,
    },
    documentLink && {
      href: documentLink.href,
      label: "Gate Pass Requests",
      description: "Use the existing document request flow for gate passes.",
      icon: ShieldCheck,
    },
    documentLink && {
      href: documentLink.href,
      label: "Move-In / Move-Out Requests",
      description: "Use the existing document request flow for move passes.",
      icon: FileCheck2,
    },
    complaintLink && {
      href: complaintLink.href,
      label: complaintLink.label,
      description: complaintLink.description,
      icon: MessageSquarePlus,
    },
    newComplaintLink && {
      href: newComplaintLink.href,
      label: newComplaintLink.label,
      description: newComplaintLink.description,
      icon: MessageSquarePlus,
    },
  ].filter(Boolean);

  return (
    <PortalPageContainer className="space-y-5">
      <PortalSectionHeader eyebrow="Resident Services" title="Requests" />
      {actions.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {actions.map((action) => action && <PortalQuickActionTile key={`${action.href}-${action.label}`} {...action} />)}
        </div>
      ) : (
        <PortalEmptyState title="No request services are enabled" description="Document requests and complaint services will appear here when they are included in your association plan." />
      )}
    </PortalPageContainer>
  );
}
