import { notFound } from "next/navigation";
import { EmployeeForm } from "@/components/employee-form";
import { PageHeader } from "@/components/page-header";
import { DeleteButton } from "@/components/ui";
import { deleteEmployeeAction } from "@/lib/actions/employees";
import { prisma } from "@/lib/db";
import { requirePayrollAccess } from "@/lib/payroll-access";

function money(value: unknown) {
  return Number(value).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

function dateLabel(value: Date | null) {
  return value ? value.toLocaleDateString("en-PH", { timeZone: "UTC" }) : "Open-ended";
}

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePayrollAccess();
  const { id } = await params;
  const employee = await prisma.employeeProfile.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      user: true,
      compensations: {
        where: { tenantId: user.tenantId },
        include: { createdBy: { select: { name: true } } },
        orderBy: { effectiveFrom: "desc" },
      },
    },
  });
  if (!employee) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Employees"
        title={employee.name}
        description={`${employee.employeeNumber} · ${employee.position}`}
        action={<form action={deleteEmployeeAction}><input type="hidden" name="id" value={employee.id} /><DeleteButton label="Delete employee" /></form>}
      />
      <EmployeeForm employee={employee} />

      <section className="card mt-6 max-w-4xl overflow-hidden">
        <div className="mb-4">
          <h2 className="text-lg font-black">Payroll configuration history</h2>
          <p className="text-sm text-slate-500">Effective-dated versions are retained for audit and payroll reproducibility. Existing versions are not overwritten when payroll terms change.</p>
        </div>
        {employee.compensations.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Effective</th>
                  <th className="px-3 py-2">Basis / frequency</th>
                  <th className="px-3 py-2">Attendance</th>
                  <th className="px-3 py-2">Rate</th>
                  <th className="px-3 py-2">Created by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employee.compensations.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3 font-semibold">{dateLabel(item.effectiveFrom)} → {dateLabel(item.effectiveTo)}</td>
                    <td className="px-3 py-3">{item.compensationBasis.replaceAll("_", " ")} · {item.payFrequency.replaceAll("_", " ")}</td>
                    <td className="px-3 py-3">{item.attendancePolicy.replaceAll("_", " ")}</td>
                    <td className="px-3 py-3 font-bold">{money(item.rate)}</td>
                    <td className="px-3 py-3">{item.createdBy?.name ?? "Legacy migration"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No effective-dated payroll configuration exists yet.</p>
        )}
      </section>
    </>
  );
}
