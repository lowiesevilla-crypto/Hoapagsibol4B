import Link from "next/link";

export default async function HomeownerWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <nav aria-label="Homeowner administration" className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <Link className="btn-secondary" href="/admin/homeowners">Homeowners</Link>
        <Link className="btn-secondary" href={`/admin/homeowners/${id}/overview`}>Resident 360</Link>
        <Link className="btn-secondary" href={`/admin/homeowners/${id}`}>Profile & Access</Link>
        <Link className="btn-primary" href={`/admin/homeowners/${id}/household-members`}>Household Members</Link>
        <Link className="btn-secondary" href={`/admin/homeowners/${id}/soa`}>Statement of Account</Link>
      </nav>
      {children}
    </>
  );
}
