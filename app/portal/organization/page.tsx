import { Mail, MapPin, Phone, UsersRound } from "lucide-react";
import { CommunityEmptyState, InfoTile, OfficerMobileCard } from "@/components/homeowner/community/community-cards";
import { PageHeader } from "@/components/page-header";
import { PortalPageContainer, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { getActiveOrganizationOfficers } from "@/lib/organization";
import { requireHomeownerProfile } from "@/lib/portal";
import { getAssociationSettings } from "@/lib/system-settings";

export default async function PortalOrganizationPage() {
  const profile = await requireHomeownerProfile();
  const [officers, association] = await Promise.all([
    getActiveOrganizationOfficers(profile.tenantId),
    getAssociationSettings(profile.tenantId),
  ]);

  return (
    <PortalPageContainer className="space-y-5">
      <PageHeader eyebrow="Your association" title="HOA information" description="Contact details and active officers serving the community." />
      <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5" aria-label="Association contacts">
        <PortalSectionHeader eyebrow="Contact" title={association.name} />
        <div className="grid gap-3 md:grid-cols-3">
          <InfoTile label="Office address" value={association.address} icon={MapPin} />
          <InfoTile label="Contact number" value={association.contactNumber} icon={Phone} />
          <InfoTile label="Email" value={association.email} icon={Mail} />
        </div>
      </section>
      <section className="space-y-3" aria-label="HOA officers">
        <PortalSectionHeader eyebrow="Roster" title="Active officers" />
        {officers.length === 0 ? (
          <CommunityEmptyState title="Officer roster is being updated" description="The association will publish officer information when available." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {officers.map((officer) => (
              <OfficerMobileCard key={officer.id} name={officer.fullName} position={officer.position} committee={officer.committee} contact={officer.contactNumber} email={officer.email} photoUrl={officer.photoUrl} />
            ))}
          </div>
        )}
      </section>
      <section className="rounded-3xl border border-pine-100 bg-pine-900 p-5 text-white shadow-soft">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10"><UsersRound className="size-5" aria-hidden="true" /></span>
          <div>
            <p className="font-black">Official HOA communication</p>
            <p className="mt-1 text-sm leading-6 text-pine-50">Use the published contact details or HOAHub chat when enabled by your association.</p>
          </div>
        </div>
      </section>
    </PortalPageContainer>
  );
}
