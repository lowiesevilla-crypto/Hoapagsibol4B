import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type PettyCashVoucherListRow = {
  id: string;
  voucherNumber: string;
  transactionDate: Date;
  payeeType: string;
  payeeName: string;
  totalAmount: Prisma.Decimal | number | string;
  status: string;
  itemCount: bigint | number;
  createdAt: Date;
};

export type PettyCashVoucherDetailRow = {
  id: string;
  tenantId: string;
  voucherNumber: string;
  transactionDate: Date;
  payeeType: string;
  payeeEntityId: string | null;
  payeeName: string;
  address: string | null;
  approvedByType: string;
  approvedById: string | null;
  approvedByName: string;
  approvedByTitle: string | null;
  receivedBy: string;
  totalAmount: Prisma.Decimal | number | string;
  employeeId: string | null;
  employeeLoanId: string | null;
  deductionPerCutoff: Prisma.Decimal | number | string | null;
  employeeName: string | null;
  status: string;
  createdById: string;
  createdByName: string;
  createdAt: Date;
};

export type PettyCashVoucherItemRow = {
  id: string;
  voucherId: string;
  expenseCategoryId: string;
  particular: string;
  amount: Prisma.Decimal | number | string;
  expenseId: string;
  displayOrder: number;
};

export async function listPettyCashVouchers(tenantId: string) {
  return prisma.$queryRaw<PettyCashVoucherListRow[]>(Prisma.sql`
    SELECT v.id, v.voucherNumber, v.transactionDate, v.payeeType, v.payeeName,
      v.totalAmount, v.status, v.createdAt,
      (SELECT COUNT(*) FROM PettyCashVoucherItem i WHERE i.tenantId=v.tenantId AND i.voucherId=v.id) AS itemCount
    FROM PettyCashVoucher v
    WHERE v.tenantId=${tenantId}
    ORDER BY v.transactionDate DESC, v.createdAt DESC
    LIMIT 250
  `);
}

export async function getPettyCashVoucher(id: string, tenantId: string) {
  const [rows, items] = await Promise.all([
    prisma.$queryRaw<PettyCashVoucherDetailRow[]>(Prisma.sql`
      SELECT v.id, v.tenantId, v.voucherNumber, v.transactionDate, v.payeeType, v.payeeEntityId,
        v.payeeName, v.address, v.approvedByType, v.approvedById, v.approvedByName,
        v.approvedByTitle, v.receivedBy, v.totalAmount, v.employeeId, v.employeeLoanId,
        v.deductionPerCutoff, v.status, v.createdById, v.createdAt,
        e.name AS employeeName, u.name AS createdByName
      FROM PettyCashVoucher v
      LEFT JOIN EmployeeProfile e ON e.tenantId=v.tenantId AND e.id=v.employeeId
      JOIN User u ON u.tenantId=v.tenantId AND u.id=v.createdById
      WHERE v.tenantId=${tenantId} AND v.id=${id}
      LIMIT 1
    `),
    prisma.$queryRaw<PettyCashVoucherItemRow[]>(Prisma.sql`
      SELECT id, voucherId, expenseCategoryId, particular, amount, expenseId, displayOrder
      FROM PettyCashVoucherItem
      WHERE tenantId=${tenantId} AND voucherId=${id}
      ORDER BY displayOrder, createdAt
    `),
  ]);
  return rows[0] ? { voucher: rows[0], items } : null;
}
