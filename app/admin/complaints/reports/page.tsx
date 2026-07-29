import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { complaintPrivacyLabel, complaintStatusLabel, getComplaintReports, requireComplaintAdmin } from "@/lib/services/complaints";

export default async function ComplaintReportsPage() {
  const user = await requireComplaintAdmin();
  const report = await getComplaintReports(user);
  return <>
    <PageHeader eyebrow="Complaint management" title="Complaint Reports" description="Tenant-scoped operational summary without confidential identity fields." action={<Link className="btn-secondary" href="/admin/complaints">Complaint queue</Link>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Total complaints" value={report.total} />
      <Metric label="Open complaints" value={report.open} />
      <Metric label="Status groups" value={report.byStatus.length} />
      <Metric label="Privacy groups" value={report.byPrivacy.length} />
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <section className="card"><h2 className="text-lg font-black">By Status</h2><div className="mt-4 space-y-2">{report.byStatus.map((item) => <Row key={item.status} label={complaintStatusLabel(item.status)} value={item._count._all} />)}</div></section>
      <section className="card"><h2 className="text-lg font-black">By Privacy Mode</h2><div className="mt-4 space-y-2">{report.byPrivacy.map((item) => <Row key={item.privacyMode} label={complaintPrivacyLabel(item.privacyMode)} value={item._count._all} />)}</div></section>
    </div>
  </>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <section className="card"><p className="text-xs font-black uppercase tracking-[.18em] text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></section>;
}

function Row({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span className="font-bold">{label}</span><span className="font-black">{value}</span></div>;
}
