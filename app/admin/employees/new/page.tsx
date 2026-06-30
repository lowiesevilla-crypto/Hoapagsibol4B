import { EmployeeForm } from "@/components/employee-form";
import { PageHeader } from "@/components/page-header";
import { requirePayrollAccess } from "@/lib/payroll-access";

export default async function NewEmployeePage() { await requirePayrollAccess(); return <><PageHeader eyebrow="Employees" title="Add an employee" description="Configure employment and salary details." /><EmployeeForm /></>; }
