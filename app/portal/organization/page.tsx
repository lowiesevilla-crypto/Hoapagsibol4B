import { OrganizationImage } from "@/components/organization-image";
import { PageHeader } from "@/components/page-header";
import { getActiveOrganizationOfficers } from "@/lib/organization";
import { requireHomeownerProfile } from "@/lib/portal";

export default async function PortalOrganizationPage() {
  const profile = await requireHomeownerProfile();
  const officers = await getActiveOrganizationOfficers(profile.tenantId);
  return <><PageHeader eyebrow="Your association" title="HOA officers" description="Meet the active officers and committees serving the community." />
    {officers.length === 0 ? <section className="card py-12 text-center text-sm text-slate-500">The organization roster is being updated.</section> : <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{officers.map((officer) => <article className="card text-center" key={officer.id}><div className="mx-auto grid size-24 place-items-center overflow-hidden rounded-full bg-pine-50 text-3xl font-black text-pine-700"><OrganizationImage src={officer.photoUrl} alt={officer.fullName} className="size-full object-cover" fallback={officer.fullName.slice(0, 1)} /></div><h2 className="mt-4 text-lg font-black">{officer.fullName}</h2><p className="font-bold text-pine-700">{officer.position}</p>{officer.committee && <p className="mt-1 text-sm text-slate-500">{officer.committee}</p>}<p className="mt-3 break-words text-xs text-slate-500">{[officer.contactNumber, officer.email].filter(Boolean).join(" | ")}</p>{officer.signatureUrl && <div className="mx-auto mt-4 grid h-14 max-w-40 place-items-center overflow-hidden rounded-xl border bg-white p-2"><OrganizationImage src={officer.signatureUrl} alt={`${officer.fullName} signature`} className="max-h-full max-w-full object-contain" fallback={<span className="text-[10px] font-bold text-slate-400">Signature unavailable</span>} /></div>}</article>)}</section>}
  </>;
}
