import { ArrowLeft, CircleHelp } from "lucide-react";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PettyCashVoucherForm } from "@/components/petty-cash-voucher-form";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { requirePettyCashFeature } from "@/lib/petty-cash/entitlement";
import { inputDate } from "@/lib/utils";

type RenterOption = { id: string; fullName: string; address: string | null; email: string | null; phone: string | null };

export default async function NewPettyCashVoucherPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const admin = await requirePermission(Permission.EXPENSES_MANAGE);
  await requirePettyCashFeature(admin.tenantId);
  const query = await searchParams;

  const [expenseTypes, employees, homeowners, contractors, officers, renters] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { tenantId: admin.tenantId, active: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.employeeProfile.findMany({ where: { tenantId: admin.tenantId, status: "ACTIVE" }, orderBy: { name: "asc" }, take: 5000 }),
    prisma.homeownerProfile.findMany({ where: { tenantId: admin.tenantId, status: "ACTIVE" }, include: { user: true }, orderBy: { user: { name: "asc" } }, take: 5000 }),
    prisma.contractorProfile.findMany({ where: { tenantId: admin.tenantId, status: "ACTIVE" }, orderBy: { companyName: "asc" }, take: 5000 }),
    prisma.organizationOfficer.findMany({ where: { tenantId: admin.tenantId, active: true, archivedAt: null }, orderBy: [{ displayOrder: "asc" }, { fullName: "asc" }], take: 500 }),
    prisma.$queryRaw<RenterOption[]>(Prisma.sql`
      SELECT id, fullName, address, email, phone
      FROM Renter
      WHERE tenantId=${admin.tenantId} AND status='ACTIVE'
      ORDER BY fullName
      LIMIT 5000
    `),
  ]);

  const employeePayees = employees.map((employee) => ({
    id: employee.id,
    label: `${employee.name} · ${employee.employeeNumber}`,
    address: employee.address || "",
    search: `${employee.name} ${employee.employeeNumber} ${employee.email || ""} ${employee.phone || ""}`.toLowerCase(),
  }));
  const homeownerPayees = homeowners.map((homeowner) => ({
    id: homeowner.id,
    label: `${homeowner.user.name} · Block ${homeowner.block} Lot ${homeowner.lot}`,
    address: homeowner.address || "",
    search: `${homeowner.user.name} ${homeowner.user.email} ${homeowner.accountNumber || ""} block ${homeowner.block} lot ${homeowner.lot} ${homeowner.phase || ""} ${homeowner.address || ""}`.toLowerCase(),
  }));
  const renterPayees = renters.map((renter) => ({
    id: renter.id,
    label: renter.fullName,
    address: renter.address || "",
    search: `${renter.fullName} ${renter.email || ""} ${renter.phone || ""} ${renter.address || ""}`.toLowerCase(),
  }));
  const contractorPayees = contractors.map((contractor) => ({
    id: contractor.id,
    label: contractor.companyName,
    address: contractor.address || "",
    search: `${contractor.companyName} ${contractor.contactPerson || ""} ${contractor.email || ""} ${contractor.phone || ""} ${contractor.address || ""}`.toLowerCase(),
  }));

  return <>
    <PageHeader
      eyebrow="Finance · Petty cash"
      title="Create Petty Cash Voucher"
      description="A guided entry flow: identify the payee, add one or more expense particulars, confirm any employee cash-advance schedule, then post and print."
      action={<Link className="btn-secondary inline-flex min-h-11 items-center gap-2" href="/admin/petty-cash"><ArrowLeft className="size-4" /> Voucher register</Link>}
    />

    {query.error && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert"><CircleHelp className="mt-0.5 size-5 shrink-0" /><div><strong className="font-black">Voucher was not posted.</strong><p className="mt-1">{query.error}</p></div></div>}
    {!expenseTypes.length && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>No active expense types are configured yet.</strong> You can still choose <b>Other</b> on a voucher line and type a new particular; HOAHub will save it as a reusable tenant expense type.</div>}

    <PettyCashVoucherForm
      today={inputDate(new Date())}
      payees={{ EMPLOYEE: employeePayees, HOMEOWNER: homeownerPayees, RENTER: renterPayees, CONTRACTOR: contractorPayees }}
      expenseTypes={expenseTypes.map((item) => ({ id: item.id, name: item.name }))}
      officers={officers.map((officer) => ({ id: officer.id, label: officer.fullName, position: officer.position }))}
      employees={employeePayees.map((item) => ({ id: item.id, label: item.label, search: item.search }))}
      currentAdminName={admin.name}
    />
  </>;
}
