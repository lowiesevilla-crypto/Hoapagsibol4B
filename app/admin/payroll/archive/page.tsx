import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { payrollManageRoles, requirePayrollAccess } from "@/lib/payroll-access";
import { shortDate } from "@/lib/utils";

export default async function PayrollArchivePage() {
  await requirePayrollAccess(payrollManageRoles);
  const archives = await prisma.payrollArchive.findMany({ include: { deletedBy: true }, orderBy: { deletedAt: "desc" }, take: 250 });
  return <>
    <PageHeader eyebrow="Payroll history" title="Payroll archive / deleted payroll history" description="Archived payroll is retained in the database for authorized future reference." action={<Link className="btn-secondary" href="/admin/payroll">Back to payroll dashboard</Link>} />
    <StandardTable><div className="table-wrap"><table className="data-table"><thead><tr><th>Payroll period</th><th>Pay date</th><th>Original status</th><th>Employees</th><th>Deleted by</th><th>Deleted at</th><th>Reason</th></tr></thead><tbody>{archives.map((item) => <tr key={item.id}><td className="font-bold">{shortDate(item.startDate)} - {shortDate(item.endDate)}<p className="text-xs text-slate-400">Original ID: {item.originalPayrollId}</p></td><td>{shortDate(item.payDate)}</td><td><StatusBadge status={item.status} /></td><td>{Array.isArray(item.employeeBreakdown) ? item.employeeBreakdown.length : "Stored"}</td><td>{item.deletedBy.name}</td><td>{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(item.deletedAt)}</td><td>{item.deletionReason || "-"}</td></tr>)}{!archives.length && <tr><td colSpan={7} className="py-12 text-center text-slate-500">No payroll periods have been archived.</td></tr>}</tbody></table></div></StandardTable>
  </>;
}
