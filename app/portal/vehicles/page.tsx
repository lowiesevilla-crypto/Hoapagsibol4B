import { CarFront, Sticker } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireHomeownerProfile } from "@/lib/portal";
import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/utils";

export default async function MyVehiclesPage() {
  const profile = await requireHomeownerProfile();
  const vehicles = await prisma.vehicle.findMany({ where: { homeownerId: profile.id }, include: { stickerCollection: true }, orderBy: { issuedAt: "desc" } });
  return <><PageHeader eyebrow="My property" title="Vehicles and HOA stickers" description="Review the vehicles and access stickers registered to your household." />
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{vehicles.map((vehicle) => <article className="card" key={vehicle.id}><div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-xl bg-pine-50 text-pine-700"><CarFront /></span><StatusBadge status={vehicle.status} /></div><h2 className="mt-4 text-lg font-black">{vehicle.make} {vehicle.model}</h2><p className="text-sm text-slate-500">{vehicle.color} · {vehicle.vehicleType}</p><dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm"><div><dt className="text-xs font-bold uppercase text-slate-400">Plate</dt><dd className="font-mono font-black">{vehicle.plateNumber}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Sticker</dt><dd className="flex items-center gap-1 font-mono font-black"><Sticker className="size-3.5" />{vehicle.stickerNumber}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Issued</dt><dd>{shortDate(vehicle.issuedAt)}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Expires</dt><dd>{vehicle.expiresAt ? shortDate(vehicle.expiresAt) : "No expiry"}</dd></div></dl>{vehicle.remarks && <p className="mt-3 text-sm text-slate-500">{vehicle.remarks}</p>}</article>)}{!vehicles.length && <div className="card text-sm text-slate-500">No vehicles are registered to your profile. Contact the HOA office to add one.</div>}</section>
  </>;
}
