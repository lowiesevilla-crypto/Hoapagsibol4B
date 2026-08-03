import { CarFront, Sticker } from "lucide-react";
import { CommunityEmptyState, VehicleMobileCard } from "@/components/homeowner/community/community-cards";
import { PageHeader } from "@/components/page-header";
import { PortalPageContainer, PortalSectionHeader, PortalSummaryCard } from "@/components/portal-mobile-shell";
import { StatusBadge } from "@/components/status-badge";
import { requireHomeownerProfile } from "@/lib/portal";
import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/utils";

export default async function MyVehiclesPage() {
  const profile = await requireHomeownerProfile();
  const vehicles = await prisma.vehicle.findMany({
    where: { tenantId: profile.tenantId, homeownerId: profile.id },
    include: { stickerCollection: true },
    orderBy: { issuedAt: "desc" },
    take: 30,
  });
  const activeCount = vehicles.filter((vehicle) => vehicle.status === "ACTIVE").length;

  return (
    <PortalPageContainer className="space-y-5">
      <PageHeader eyebrow="My property" title="Vehicles and HOA stickers" description="Vehicles and access stickers registered to your household." />
      <section className="grid gap-3 md:grid-cols-2" aria-label="Vehicle summary">
        <PortalSummaryCard label="Registered vehicles" value={String(vehicles.length)} note="Homeowner-owned records only" icon={CarFront} />
        <PortalSummaryCard label="Active stickers" value={String(activeCount)} note="Based on current vehicle status" icon={Sticker} />
      </section>
      <section className="space-y-3">
        <PortalSectionHeader eyebrow="Vehicles" title="Registered vehicles" />
        {vehicles.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {vehicles.map((vehicle) => (
              <VehicleMobileCard
                key={vehicle.id}
                title={`${vehicle.make} ${vehicle.model}`}
                subtitle={`${vehicle.color} | ${vehicle.vehicleType}`}
                plate={vehicle.plateNumber}
                sticker={vehicle.stickerNumber}
                issued={shortDate(vehicle.issuedAt)}
                expires={vehicle.expiresAt ? shortDate(vehicle.expiresAt) : "No expiry"}
                status={<StatusBadge status={vehicle.status} />}
                remarks={vehicle.remarks}
              />
            ))}
          </div>
        ) : (
          <CommunityEmptyState title="No vehicles registered" description="Contact the HOA office to add a household vehicle or sticker record." />
        )}
      </section>
    </PortalPageContainer>
  );
}
