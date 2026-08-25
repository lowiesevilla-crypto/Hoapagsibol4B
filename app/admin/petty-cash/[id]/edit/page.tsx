import { ArrowLeft, CircleHelp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PettyCashVoucherEditForm } from "@/components/petty-cash-voucher-edit-form";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { requirePettyCashFeature } from "@/lib/petty-cash/entitlement";
import { getPettyCashVoucher } from "@/lib/petty-cash/service";
import { inputDate } from "@/lib/utils";

type RenterOption = { id: string; fullName: string; address: string | null; email: string | null; phone: string | null };

function prependMissingById<T extends { id: string }>(rows: T[], requiredRows: T[]) {
  const existingIds = new Set(rows.map((row) => row.id));
  return [...requiredRows.filter((row) => !existingIds.has(row.id)), ...rows];
}

export default async function EditPettyCashVoucherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await requirePermission(Permission.EXPENSES_MANAGE);
  await requirePettyCashFeature(admin.tenantId);
  const { id } = await params;
  const query = await searchParams;
  const record = await getPettyCashVoucher(id, admin.tenantId);
  if (!record) notFound();
  const { voucher, items } = record;

  const currentCategoryIds = Array.from(new Set(items.map((item) => item.expenseCategoryId)));
  const currentEmployeeIds = Array.from(new Set([
    voucher.employeeId,
    voucher.payeeType === "EMPLOYEE" ? voucher.payeeEntityId : null,
  ].filter((value): value is string => Boolean(value))));
  const currentHomeownerId = voucher.payeeType === "HOMEOWNER" ? voucher.payeeEntityId : null;
  const currentContractorId = voucher.payeeType === "CONTRACTOR" ? voucher.payeeEntityId : null;
  const currentRenterId = voucher.payeeType === "RENTER" ? voucher.payeeEntityId : null;
  const currentOfficerId = voucher.approvedByType === "OFFICER" ? voucher.approvedById : null;

  // Load the searchable active directory with bounded queries. Saved voucher rows are
  // hydrated separately below so a current selection can never disappear because a
  // large tenant exceeded one of these result caps.
  const [expenseTypes, employees, homeowners, contractors, officers, renters] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { tenantId: admin.tenantId, active: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    prisma.employeeProfile.findMany({
      where: { tenantId: admin.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      take: 5000,
    }),
    prisma.homeownerProfile.findMany({
      where: { tenantId: admin.tenantId, status: "ACTIVE" },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
      take: 5000,
    }),
    prisma.contractorProfile.findMany({
      where: { tenantId: admin.tenantId, status: "ACTIVE" },
      orderBy: { companyName: "asc" },
      take: 5000,
    }),
    prisma.organizationOfficer.findMany({
      where: { tenantId: admin.tenantId, active: true, archivedAt: null },
      orderBy: [{ displayOrder: "asc" }, { fullName: "asc" }],
      take: 500,
    }),
    prisma.$queryRaw<RenterOption[]>(Prisma.sql`
      SELECT id, fullName, address, email, phone
      FROM Renter
      WHERE tenantId=${admin.tenantId} AND status='ACTIVE'
      ORDER BY fullName
      LIMIT 5000
    `),
  ]);

  const missingCategoryIds = currentCategoryIds.filter((currentId) => !expenseTypes.some((item) => item.id === currentId));
  const missingEmployeeIds = currentEmployeeIds.filter((currentId) => !employees.some((item) => item.id === currentId));

  const [currentExpenseTypes, currentEmployees, currentHomeowner, currentContractor, currentOfficer, currentRenters] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { tenantId: admin.tenantId, id: { in: missingCategoryIds } },
      orderBy: { name: "asc" },
    }),
    prisma.employeeProfile.findMany({
      where: { tenantId: admin.tenantId, id: { in: missingEmployeeIds } },
      orderBy: { name: "asc" },
    }),
    currentHomeownerId && !homeowners.some((item) => item.id === currentHomeownerId)
      ? prisma.homeownerProfile.findFirst({
          where: { id: currentHomeownerId, tenantId: admin.tenantId },
          include: { user: true },
        })
      : Promise.resolve(null),
    currentContractorId && !contractors.some((item) => item.id === currentContractorId)
      ? prisma.contractorProfile.findFirst({
          where: { id: currentContractorId, tenantId: admin.tenantId },
        })
      : Promise.resolve(null),
    currentOfficerId && !officers.some((item) => item.id === currentOfficerId)
      ? prisma.organizationOfficer.findFirst({
          where: { id: currentOfficerId, tenantId: admin.tenantId },
        })
      : Promise.resolve(null),
    currentRenterId && !renters.some((item) => item.id === currentRenterId)
      ? prisma.$queryRaw<RenterOption[]>(Prisma.sql`
          SELECT id, fullName, address, email, phone
          FROM Renter
          WHERE tenantId=${admin.tenantId} AND id=${currentRenterId}
          LIMIT 1
        `)
      : Promise.resolve<RenterOption[]>([]),
  ]);

  const expenseTypeRows = prependMissingById(expenseTypes, currentExpenseTypes);
  const employeeRows = prependMissingById(employees, currentEmployees);
  const homeownerRows = prependMissingById(homeowners, currentHomeowner ? [currentHomeowner] : []);
  const contractorRows = prependMissingById(contractors, currentContractor ? [currentContractor] : []);
  const officerRows = prependMissingById(officers, currentOfficer ? [currentOfficer] : []);
  const renterRows = prependMissingById(renters, currentRenters);

  const employeePayees = employeeRows.map((employee) => ({
    id: employee.id,
    label: `${employee.name} · ${employee.employeeNumber}`,
    address: employee.address || "",
    search: `${employee.name} ${employee.employeeNumber} ${employee.email || ""} ${employee.phone || ""}`.toLowerCase(),
  }));
  const homeownerPayees = homeownerRows.map((homeowner) => ({
    id: homeowner.id,
    label: `${homeowner.user.name} · Block ${homeowner.block} Lot ${homeowner.lot}`,
    address: homeowner.address || "",
    search: `${homeowner.user.name} ${homeowner.user.email} ${homeowner.accountNumber || ""} block ${homeowner.block} lot ${homeowner.lot} ${homeowner.phase || ""} ${homeowner.address || ""}`.toLowerCase(),
  }));
  const renterPayees = renterRows.map((renter) => ({
    id: renter.id,
    label: renter.fullName,
    address: renter.address || "",
    search: `${renter.fullName} ${renter.email || ""} ${renter.phone || ""} ${renter.address || ""}`.toLowerCase(),
  }));
  const contractorPayees = contractorRows.map((contractor) => ({
    id: contractor.id,
    label: contractor.companyName,
    address: contractor.address || "",
    search: `${contractor.companyName} ${contractor.contactPerson || ""} ${contractor.email || ""} ${contractor.phone || ""} ${contractor.address || ""}`.toLowerCase(),
  }));

  return <>
    <PageHeader
      eyebrow="Finance · Petty cash"
      title={`Edit ${voucher.voucherNumber}`}
      description="Update the payee, particulars, amounts and approval data while keeping the original voucher number and audit trail."
      action={<Link className="btn-secondary inline-flex min-h-11 items-center gap-2" href={`/admin/petty-cash/${voucher.id}`}><ArrowLeft className="size-4" /> Back to voucher</Link>}
    />

    {query.error && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert"><CircleHelp className="mt-0.5 size-5 shrink-0" /><div><strong className="font-black">Voucher was not updated.</strong><p className="mt-1">{query.error}</p></div></div>}

    <PettyCashVoucherEditForm
      initial={{
        id: voucher.id,
        voucherNumber: voucher.voucherNumber,
        transactionDate: inputDate(voucher.transactionDate),
        payeeType: voucher.payeeType as "EMPLOYEE" | "HOMEOWNER" | "RENTER" | "CONTRACTOR" | "OTHER",
        payeeEntityId: voucher.payeeEntityId || "",
        payeeName: voucher.payeeName,
        address: voucher.address || "",
        approvedByType: voucher.approvedByType as "ADMIN" | "OFFICER",
        approvedById: voucher.approvedById || "",
        employeeId: voucher.employeeId || "",
        deductionPerCutoff: voucher.deductionPerCutoff ? String(voucher.deductionPerCutoff) : "",
        items: items.map((item) => ({ categoryId: item.expenseCategoryId, particular: item.particular, amount: String(item.amount) })),
      }}
      payees={{ EMPLOYEE: employeePayees, HOMEOWNER: homeownerPayees, RENTER: renterPayees, CONTRACTOR: contractorPayees }}
      expenseTypes={expenseTypeRows.map((item) => ({ id: item.id, name: item.name }))}
      officers={officerRows.map((officer) => ({ id: officer.id, label: officer.fullName, position: officer.position }))}
      employees={employeePayees.map((item) => ({ id: item.id, label: item.label, search: item.search }))}
      currentAdminName={admin.name}
    />
  </>;
}
