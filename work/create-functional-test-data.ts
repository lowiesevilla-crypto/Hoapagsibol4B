import {
  AttendanceStatus,
  BillStatus,
  CollectionType,
  ContractorStatus,
  EmployeeLoanStatus,
  EmployeeLoanType,
  EmployeeStatus,
  HomeownerStatus,
  PayerType,
  PaymentMethod,
  PaymentRequestStatus,
  PaymentRequestType,
  PayrollStatus,
  PrismaClient,
  RefundStatus,
  Role,
  SalaryType,
  VehicleStatus,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { calculatePayslip } from "../lib/services/payroll";

const prisma = new PrismaClient();
const TEST_PASSWORD = "ChangeMe123!";
const TENANT_ID = "tenant_pagsibol4b_default";

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

async function ensureAdminUser() {
  const passwordHash = await hash(TEST_PASSWORD, 12);
  return prisma.user.upsert({
    where: { tenantId_email: { tenantId: TENANT_ID, email: "admin@greenmeadows.test" } },
    update: { role: Role.ADMIN },
    create: {
      tenantId: TENANT_ID,
      name: "Maria Santos",
      email: "admin@greenmeadows.test",
      passwordHash,
      role: Role.ADMIN,
    },
  });
}

async function nextReceiptNumber(date: Date) {
  return prisma.$transaction(async (tx) => {
    const year = date.getUTCFullYear();
    const counter = await tx.receiptCounter.upsert({
      where: { tenantId_series_year: { tenantId: TENANT_ID, series: "MD", year } },
      create: { tenantId: TENANT_ID, series: "MD", year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return `AR-MD-${year}-${String(counter.lastNumber).padStart(7, "0")}`;
  });
}

async function assignPaymentReceipt(paymentId: string, paymentDate: Date) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { receiptNumber: true } });
  if (payment?.receiptNumber) return payment.receiptNumber;
  const receiptNumber = await nextReceiptNumber(paymentDate);
  await prisma.payment.update({ where: { id: paymentId }, data: { receiptNumber } });
  return receiptNumber;
}

async function assignCollectionReceipt(collectionId: string, collectionDate: Date) {
  const collection = await prisma.collection.findUnique({ where: { id: collectionId }, select: { receiptNumber: true } });
  if (collection?.receiptNumber) return collection.receiptNumber;
  const receiptNumber = await nextReceiptNumber(collectionDate);
  await prisma.collection.update({ where: { id: collectionId }, data: { receiptNumber } });
  return receiptNumber;
}

async function upsertPayment(data: {
  billId: string;
  homeownerId: string;
  amount: number;
  paymentDate: Date;
  method: PaymentMethod;
  referenceNumber: string;
  remarks: string;
}) {
  const existing = await prisma.payment.findFirst({ where: { referenceNumber: data.referenceNumber } });
  const payment = existing
    ? await prisma.payment.update({ where: { id: existing.id }, data })
    : await prisma.payment.create({ data });
  await assignPaymentReceipt(payment.id, data.paymentDate);
  return payment;
}

async function upsertCollection(data: {
  type: CollectionType;
  description?: string;
  payerType: PayerType;
  homeownerId?: string;
  contractorId?: string;
  amount: number;
  collectionDate: Date;
  method: PaymentMethod;
  referenceNumber: string;
  remarks?: string;
  refundable: boolean;
  refundStatus: RefundStatus;
  createdById: string;
}) {
  const existing = await prisma.collection.findFirst({ where: { referenceNumber: data.referenceNumber } });
  const collection = existing
    ? await prisma.collection.update({ where: { id: existing.id }, data })
    : await prisma.collection.create({ data });
  await assignCollectionReceipt(collection.id, data.collectionDate);
  return collection;
}

async function upsertAnnouncement(data: {
  title: string;
  content: string;
  createdById: string;
  sendEmail?: boolean;
  postToFacebook?: boolean;
}) {
  const existing = await prisma.announcement.findFirst({ where: { title: data.title } });
  return existing
    ? prisma.announcement.update({ where: { id: existing.id }, data })
    : prisma.announcement.create({ data });
}

async function upsertEvent(data: {
  title: string;
  description: string;
  eventDate: Date;
  eventTime: string;
  location: string;
  createdById: string;
  postToFacebook?: boolean;
}) {
  const existing = await prisma.event.findFirst({ where: { title: data.title } });
  return existing
    ? prisma.event.update({ where: { id: existing.id }, data })
    : prisma.event.create({ data });
}

async function upsertExpense(data: {
  categoryId: string;
  description: string;
  payee: string;
  amount: number;
  expenseDate: Date;
  method: PaymentMethod;
  referenceNumber: string;
  voucherNumber: string;
  remarks?: string;
  createdById: string;
}) {
  const existing = await prisma.expense.findFirst({ where: { voucherNumber: data.voucherNumber } });
  return existing ? prisma.expense.update({ where: { id: existing.id }, data }) : prisma.expense.create({ data });
}

async function main() {
  const admin = await ensureAdminUser();
  const passwordHash = await hash(TEST_PASSWORD, 12);

  const homeownerInputs = [
    {
      name: "Test Homeowner One",
      email: "test.homeowner1@pagsibol.test",
      phone: "09170000001",
      address: "Block T, Lot 1, Pagsibol Village PH2 4B East",
      block: "T",
      lot: "1",
      monthlyDuesAmount: 1000,
    },
    {
      name: "Test Homeowner Two",
      email: "test.homeowner2@pagsibol.test",
      phone: "09170000002",
      address: "Block T, Lot 2, Pagsibol Village PH2 4B East",
      block: "T",
      lot: "2",
      monthlyDuesAmount: 1000,
    },
  ] as const;

  const homeowners = [];
  for (const item of homeownerInputs) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: TENANT_ID, email: item.email } },
      update: { name: item.name, role: Role.HOMEOWNER, passwordHash },
      create: { tenantId: TENANT_ID, name: item.name, email: item.email, role: Role.HOMEOWNER, passwordHash },
    });
    homeowners.push(
      await prisma.homeownerProfile.upsert({
        where: { userId: user.id },
        update: {
          address: item.address,
          block: item.block,
          lot: item.lot,
          phone: item.phone,
          messengerId: `test_${item.block}_${item.lot}`,
          status: HomeownerStatus.ACTIVE,
          monthlyDuesAmount: item.monthlyDuesAmount,
        },
        create: {
          userId: user.id,
          address: item.address,
          block: item.block,
          lot: item.lot,
          phone: item.phone,
          messengerId: `test_${item.block}_${item.lot}`,
          status: HomeownerStatus.ACTIVE,
          monthlyDuesAmount: item.monthlyDuesAmount,
        },
      }),
    );
  }

  const billInputs = [
    { homeowner: homeowners[0], month: utcDate(2026, 6, 1), dueDate: utcDate(2026, 6, 30), amount: 1000, paid: 1000, status: BillStatus.PAID, ref: "TEST-PAY-0001", method: PaymentMethod.GCASH },
    { homeowner: homeowners[1], month: utcDate(2026, 5, 1), dueDate: utcDate(2026, 5, 31), amount: 1000, paid: 1000, status: BillStatus.PAID, ref: "TEST-PAY-0002", method: PaymentMethod.BANK_TRANSFER },
    { homeowner: homeowners[0], month: utcDate(2026, 7, 1), dueDate: utcDate(2026, 7, 31), amount: 1000, paid: 500, status: BillStatus.PARTIAL, ref: "TEST-PAY-0003", method: PaymentMethod.CASH },
    { homeowner: homeowners[1], month: utcDate(2026, 6, 1), dueDate: utcDate(2026, 6, 30), amount: 1000, paid: 0, status: BillStatus.UNPAID, ref: null, method: PaymentMethod.GCASH },
  ] as const;

  const bills = [];
  for (const item of billInputs) {
    const bill = await prisma.bill.upsert({
      where: { homeownerId_billingMonth: { homeownerId: item.homeowner.id, billingMonth: item.month } },
      update: {
        amount: item.amount,
        penalty: 0,
        totalAmount: item.amount,
        amountPaid: item.paid,
        balance: item.amount - item.paid,
        dueDate: item.dueDate,
        status: item.status,
        notes: "TEST monthly dues bill for portal verification.",
      },
      create: {
        homeownerId: item.homeowner.id,
        billingMonth: item.month,
        amount: item.amount,
        penalty: 0,
        totalAmount: item.amount,
        amountPaid: item.paid,
        balance: item.amount - item.paid,
        dueDate: item.dueDate,
        status: item.status,
        notes: "TEST monthly dues bill for portal verification.",
      },
    });
    bills.push(bill);
    if (item.ref && item.paid > 0) {
      await upsertPayment({
        billId: bill.id,
        homeownerId: item.homeowner.id,
        amount: item.paid,
        paymentDate: utcDate(2026, 6, 24),
        method: item.method,
        referenceNumber: item.ref,
        remarks: "TEST payment for portal verification.",
      });
    }
  }

  await prisma.paymentRequest.upsert({
    where: { id: (await prisma.paymentRequest.findFirst({ where: { referenceNumber: "TEST-QR-0001" }, select: { id: true } }))?.id ?? "new-test-qr-0001" },
    update: {
      type: PaymentRequestType.MONTHLY_DUES,
      status: PaymentRequestStatus.PENDING_REVIEW,
      homeownerId: homeowners[1].id,
      billId: bills[3].id,
      amount: 1000,
      paymentDate: utcDate(2026, 6, 24),
      method: PaymentMethod.GCASH,
      referenceNumber: "TEST-QR-0001",
      payerNotes: "TEST pending QR payment for monthly dues.",
    },
    create: {
      type: PaymentRequestType.MONTHLY_DUES,
      status: PaymentRequestStatus.PENDING_REVIEW,
      homeownerId: homeowners[1].id,
      billId: bills[3].id,
      amount: 1000,
      paymentDate: utcDate(2026, 6, 24),
      method: PaymentMethod.GCASH,
      referenceNumber: "TEST-QR-0001",
      payerNotes: "TEST pending QR payment for monthly dues.",
    },
  });

  await prisma.paymentRequest.upsert({
    where: { id: (await prisma.paymentRequest.findFirst({ where: { referenceNumber: "TEST-QR-0002" }, select: { id: true } }))?.id ?? "new-test-qr-0002" },
    update: {
      type: PaymentRequestType.OTHER_COLLECTION,
      status: PaymentRequestStatus.PENDING_REVIEW,
      homeownerId: homeowners[0].id,
      collectionType: CollectionType.STICKER,
      description: "TEST sticker payment request",
      amount: 150,
      paymentDate: utcDate(2026, 6, 24),
      method: PaymentMethod.GCASH,
      referenceNumber: "TEST-QR-0002",
      payerNotes: "TEST pending QR payment for sticker.",
    },
    create: {
      type: PaymentRequestType.OTHER_COLLECTION,
      status: PaymentRequestStatus.PENDING_REVIEW,
      homeownerId: homeowners[0].id,
      collectionType: CollectionType.STICKER,
      description: "TEST sticker payment request",
      amount: 150,
      paymentDate: utcDate(2026, 6, 24),
      method: PaymentMethod.GCASH,
      referenceNumber: "TEST-QR-0002",
      payerNotes: "TEST pending QR payment for sticker.",
    },
  });

  const stickerCollectionOne = await upsertCollection({
    type: CollectionType.STICKER,
    description: "TEST vehicle sticker collection 1",
    payerType: PayerType.HOMEOWNER,
    homeownerId: homeowners[0].id,
    amount: 150,
    collectionDate: utcDate(2026, 6, 24),
    method: PaymentMethod.CASH,
    referenceNumber: "TEST-COLL-STICKER-001",
    remarks: "TEST sticker collection.",
    refundable: false,
    refundStatus: RefundStatus.NOT_APPLICABLE,
    createdById: admin.id,
  });
  const stickerCollectionTwo = await upsertCollection({
    type: CollectionType.STICKER,
    description: "TEST vehicle sticker collection 2",
    payerType: PayerType.HOMEOWNER,
    homeownerId: homeowners[1].id,
    amount: 150,
    collectionDate: utcDate(2026, 6, 24),
    method: PaymentMethod.GCASH,
    referenceNumber: "TEST-COLL-STICKER-002",
    remarks: "TEST sticker collection.",
    refundable: false,
    refundStatus: RefundStatus.NOT_APPLICABLE,
    createdById: admin.id,
  });
  await upsertCollection({
    type: CollectionType.GATE_PASS,
    description: "TEST gate pass collection",
    payerType: PayerType.HOMEOWNER,
    homeownerId: homeowners[0].id,
    amount: 200,
    collectionDate: utcDate(2026, 6, 25),
    method: PaymentMethod.CASH,
    referenceNumber: "TEST-COLL-GATE-001",
    remarks: "TEST gate pass collection.",
    refundable: false,
    refundStatus: RefundStatus.NOT_APPLICABLE,
    createdById: admin.id,
  });
  await upsertCollection({
    type: CollectionType.MEMBERSHIP,
    description: "TEST membership collection",
    payerType: PayerType.HOMEOWNER,
    homeownerId: homeowners[1].id,
    amount: 500,
    collectionDate: utcDate(2026, 6, 25),
    method: PaymentMethod.BANK_TRANSFER,
    referenceNumber: "TEST-COLL-MEMBER-001",
    remarks: "TEST membership collection.",
    refundable: false,
    refundStatus: RefundStatus.NOT_APPLICABLE,
    createdById: admin.id,
  });

  const contractors = [];
  for (const item of [
    {
      companyName: "TEST BuildRight Contractors",
      contactPerson: "Ramon Test",
      email: "testramon.contractor@pagsibol.test",
      phone: "09171110001",
      address: "Rizal Test Office 1",
      licenseNumber: "TEST-PCAB-001",
    },
    {
      companyName: "TEST East Gate Builders",
      contactPerson: "Lina Test",
      email: "testlina.contractor@pagsibol.test",
      phone: "09171110002",
      address: "Rizal Test Office 2",
      licenseNumber: "TEST-PCAB-002",
    },
  ]) {
    contractors.push(
      await prisma.contractorProfile.upsert({
        where: { tenantId_companyName: { tenantId: TENANT_ID, companyName: item.companyName } },
        update: { ...item, status: ContractorStatus.ACTIVE },
        create: { ...item, tenantId: TENANT_ID, status: ContractorStatus.ACTIVE },
      }),
    );
  }

  await upsertCollection({
    type: CollectionType.CONTRACTOR_BOND,
    description: "TEST contractor bond 1",
    payerType: PayerType.CONTRACTOR,
    contractorId: contractors[0].id,
    amount: 15000,
    collectionDate: utcDate(2026, 6, 24),
    method: PaymentMethod.CHECK,
    referenceNumber: "TEST-CONTRACTOR-BOND-001",
    remarks: "TEST refundable contractor bond.",
    refundable: true,
    refundStatus: RefundStatus.HELD,
    createdById: admin.id,
  });
  await upsertCollection({
    type: CollectionType.CONTRACTOR_BOND,
    description: "TEST contractor bond 2",
    payerType: PayerType.CONTRACTOR,
    contractorId: contractors[1].id,
    amount: 18000,
    collectionDate: utcDate(2026, 6, 25),
    method: PaymentMethod.BANK_TRANSFER,
    referenceNumber: "TEST-CONTRACTOR-BOND-002",
    remarks: "TEST refundable contractor bond.",
    refundable: true,
    refundStatus: RefundStatus.HELD,
    createdById: admin.id,
  });

  await prisma.vehicle.upsert({
    where: { tenantId_plateNumber: { tenantId: TENANT_ID, plateNumber: "TEST-AAA-001" } },
    update: {
      tenantId: TENANT_ID,
      homeownerId: homeowners[0].id,
      vehicleType: "SUV",
      make: "Toyota",
      model: "Fortuner",
      color: "White",
      stickerNumber: "TEST-STICKER-001",
      stickerCollectionId: stickerCollectionOne.id,
      issuedAt: utcDate(2026, 6, 24),
      expiresAt: utcDate(2026, 12, 31),
      status: VehicleStatus.ACTIVE,
      remarks: "TEST vehicle record.",
    },
    create: {
      homeownerId: homeowners[0].id,
      plateNumber: "TEST-AAA-001",
      vehicleType: "SUV",
      make: "Toyota",
      model: "Fortuner",
      color: "White",
      stickerNumber: "TEST-STICKER-001",
      stickerCollectionId: stickerCollectionOne.id,
      issuedAt: utcDate(2026, 6, 24),
      expiresAt: utcDate(2026, 12, 31),
      status: VehicleStatus.ACTIVE,
      remarks: "TEST vehicle record.",
    },
  });
  await prisma.vehicle.upsert({
    where: { tenantId_plateNumber: { tenantId: TENANT_ID, plateNumber: "TEST-BBB-002" } },
    update: {
      tenantId: TENANT_ID,
      homeownerId: homeowners[1].id,
      vehicleType: "Sedan",
      make: "Honda",
      model: "City",
      color: "Silver",
      stickerNumber: "TEST-STICKER-002",
      stickerCollectionId: stickerCollectionTwo.id,
      issuedAt: utcDate(2026, 6, 24),
      expiresAt: utcDate(2026, 12, 31),
      status: VehicleStatus.ACTIVE,
      remarks: "TEST vehicle record.",
    },
    create: {
      homeownerId: homeowners[1].id,
      plateNumber: "TEST-BBB-002",
      vehicleType: "Sedan",
      make: "Honda",
      model: "City",
      color: "Silver",
      stickerNumber: "TEST-STICKER-002",
      stickerCollectionId: stickerCollectionTwo.id,
      issuedAt: utcDate(2026, 6, 24),
      expiresAt: utcDate(2026, 12, 31),
      status: VehicleStatus.ACTIVE,
      remarks: "TEST vehicle record.",
    },
  });

  const employees = [];
  for (const item of [
    {
      employeeNumber: "TEST-EMP-001",
      name: "Test Payroll Employee One",
      position: "Test Admin Assistant",
      email: "test.employee1@pagsibol.test",
      phone: "09172220001",
      address: "Pagsibol Test Employee Address 1",
      hireDate: utcDate(2026, 1, 5),
      salaryType: SalaryType.MONTHLY,
      baseRate: 18000,
      standardWorkDays: 26,
      fixedAllowance: 1000,
      fixedDeduction: 500,
    },
    {
      employeeNumber: "TEST-EMP-002",
      name: "Test Payroll Employee Two",
      position: "Test Maintenance Staff",
      email: "test.employee2@pagsibol.test",
      phone: "09172220002",
      address: "Pagsibol Test Employee Address 2",
      hireDate: utcDate(2026, 2, 10),
      salaryType: SalaryType.DAILY,
      baseRate: 650,
      standardWorkDays: 26,
      fixedAllowance: 300,
      fixedDeduction: 100,
    },
  ]) {
    employees.push(
      await prisma.employeeProfile.upsert({
        where: { tenantId_employeeNumber: { tenantId: TENANT_ID, employeeNumber: item.employeeNumber } },
        update: { ...item, status: EmployeeStatus.ACTIVE },
        create: { ...item, tenantId: TENANT_ID, status: EmployeeStatus.ACTIVE },
      }),
    );
  }

  const deductionInputs = [
    { name: "TEST Cash Advance", description: "TEST payroll deduction type assigned only when an employee has a cash advance for the cutoff.", amount: 250, active: true, applyToMonthly: true, applyToDaily: true },
    { name: "TEST Uniform Deduction", description: "TEST payroll deduction type assigned only to employees with uniform charges for the cutoff.", amount: 150, active: true, applyToMonthly: true, applyToDaily: true },
  ];
  for (const item of deductionInputs) {
    await prisma.payrollDeductionType.upsert({ where: { tenantId_name: { tenantId: TENANT_ID, name: item.name } }, update: item, create: { ...item, tenantId: TENANT_ID } });
  }

  for (const employee of employees) {
    for (const item of [
      { date: utcDate(2026, 6, 3), status: AttendanceStatus.PRESENT, timeIn: "08:00", timeOut: "17:00", overtimeHours: 1, remarks: "TEST attendance." },
      { date: utcDate(2026, 6, 4), status: AttendanceStatus.HALF_DAY, timeIn: "08:00", timeOut: "12:00", overtimeHours: 0, remarks: "TEST half-day attendance." },
      { date: utcDate(2026, 6, 17), status: AttendanceStatus.PRESENT, timeIn: "08:00", timeOut: "17:00", overtimeHours: 2, remarks: "TEST attendance." },
      { date: utcDate(2026, 6, 18), status: AttendanceStatus.PAID_LEAVE, timeIn: null, timeOut: null, overtimeHours: 0, remarks: "TEST paid leave." },
    ]) {
      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: employee.id, date: item.date } },
        update: item,
        create: { employeeId: employee.id, ...item },
      });
    }
  }

  const deductionTypes = await prisma.payrollDeductionType.findMany({ where: { name: { in: deductionInputs.map((item) => item.name) } } });
  const employeeLoans = [];
  for (const item of [
    {
      employeeId: employees[0].id,
      type: EmployeeLoanType.CASH_ADVANCE,
      description: "TEST June cash advance",
      principalAmount: 1000,
      issuedDate: utcDate(2026, 6, 2),
      referenceNumber: "TEST-CA-001",
      remarks: "TEST cash advance with a draft payroll repayment.",
    },
    {
      employeeId: employees[1].id,
      type: EmployeeLoanType.LOAN,
      description: "TEST emergency employee loan",
      principalAmount: 1200,
      issuedDate: utcDate(2026, 6, 12),
      referenceNumber: "TEST-LOAN-001",
      remarks: "TEST employee loan with a paid payroll repayment.",
    },
  ]) {
    const existing = await prisma.employeeLoan.findFirst({ where: { employeeId: item.employeeId, description: item.description } });
    employeeLoans.push(
      existing
        ? await prisma.employeeLoan.update({
            where: { id: existing.id },
            data: { ...item, amountPaid: 0, balance: item.principalAmount, status: EmployeeLoanStatus.OPEN },
          })
        : await prisma.employeeLoan.create({
            data: { ...item, amountPaid: 0, balance: item.principalAmount, status: EmployeeLoanStatus.OPEN },
          }),
    );
  }

  for (const item of [
    { startDate: utcDate(2026, 6, 1), endDate: utcDate(2026, 6, 15), payDate: utcDate(2026, 6, 16), status: PayrollStatus.DRAFT },
    { startDate: utcDate(2026, 6, 16), endDate: utcDate(2026, 6, 30), payDate: utcDate(2026, 7, 1), status: PayrollStatus.PAID },
  ]) {
    const payroll = await prisma.payrollPeriod.upsert({
      where: { tenantId_startDate_endDate: { tenantId: TENANT_ID, startDate: item.startDate, endDate: item.endDate } },
      update: { payDate: item.payDate, status: item.status, createdById: admin.id },
      create: { ...item, tenantId: TENANT_ID, createdById: admin.id },
    });
    const cashAdvance = deductionTypes.find((deduction) => deduction.name === "TEST Cash Advance");
    const uniformDeduction = deductionTypes.find((deduction) => deduction.name === "TEST Uniform Deduction");
    if (cashAdvance && uniformDeduction) {
      const assignments = item.status === PayrollStatus.DRAFT
        ? [
            { employeeId: employees[0].id, deductionTypeId: cashAdvance.id, employeeLoanId: employeeLoans[0].id, amount: 250, remarks: "TEST cash advance partial payment for first cutoff." },
            { employeeId: employees[1].id, deductionTypeId: uniformDeduction.id, employeeLoanId: null, amount: 150, remarks: "TEST uniform deduction for first cutoff." },
          ]
        : [
            { employeeId: employees[0].id, deductionTypeId: uniformDeduction.id, employeeLoanId: null, amount: 150, remarks: "TEST uniform deduction for second cutoff." },
            { employeeId: employees[1].id, deductionTypeId: cashAdvance.id, employeeLoanId: employeeLoans[1].id, amount: 300, remarks: "TEST employee loan partial payment for second cutoff." },
          ];
      for (const assignment of assignments) {
        await prisma.payrollDeduction.upsert({
          where: { payrollId_employeeId_deductionTypeId: { payrollId: payroll.id, employeeId: assignment.employeeId, deductionTypeId: assignment.deductionTypeId } },
          update: { employeeLoanId: assignment.employeeLoanId, amount: assignment.amount, remarks: assignment.remarks },
          create: { payrollId: payroll.id, ...assignment },
        });
      }
    }
    for (const employee of employees) {
      const attendance = await prisma.attendance.findMany({ where: { employeeId: employee.id, date: { gte: item.startDate, lte: item.endDate } } });
      const employeeDeductions = await prisma.payrollDeduction.findMany({ where: { payrollId: payroll.id, employeeId: employee.id } });
      const values = calculatePayslip(employee, attendance, employeeDeductions);
      await prisma.payslip.upsert({
        where: { payrollId_employeeId: { payrollId: payroll.id, employeeId: employee.id } },
        update: values,
        create: { payrollId: payroll.id, employeeId: employee.id, ...values },
      });
    }
  }

  for (const loan of employeeLoans) {
    const paidRepayments = await prisma.payrollDeduction.findMany({ where: { employeeLoanId: loan.id, payroll: { status: PayrollStatus.PAID } }, select: { amount: true } });
    const amountPaid = paidRepayments.reduce((sum, item) => sum + Number(item.amount), 0);
    const balance = Math.max(0, Number(loan.principalAmount) - amountPaid);
    await prisma.employeeLoan.update({
      where: { id: loan.id },
      data: { amountPaid, balance, status: balance <= 0 ? EmployeeLoanStatus.PAID : EmployeeLoanStatus.OPEN },
    });
  }

  const categories = [];
  for (const item of [
    { name: "TEST Utilities", description: "TEST expense category for utilities." },
    { name: "TEST Repairs", description: "TEST expense category for repairs." },
  ]) {
    categories.push(await prisma.expenseCategory.upsert({ where: { tenantId_name: { tenantId: TENANT_ID, name: item.name } }, update: { ...item, active: true }, create: { ...item, tenantId: TENANT_ID, active: true } }));
  }
  await upsertExpense({
    categoryId: categories[0].id,
    description: "TEST clubhouse electricity expense",
    payee: "TEST Utility Provider",
    amount: 2500,
    expenseDate: utcDate(2026, 6, 24),
    method: PaymentMethod.BANK_TRANSFER,
    referenceNumber: "TEST-EXP-UTIL-001",
    voucherNumber: "TEST-CV-0001",
    remarks: "TEST expense record.",
    createdById: admin.id,
  });
  await upsertExpense({
    categoryId: categories[1].id,
    description: "TEST gate repair expense",
    payee: "TEST Repair Supplier",
    amount: 4800,
    expenseDate: utcDate(2026, 6, 25),
    method: PaymentMethod.CASH,
    referenceNumber: "TEST-EXP-REPAIR-001",
    voucherNumber: "TEST-CV-0002",
    remarks: "TEST expense record.",
    createdById: admin.id,
  });

  await upsertAnnouncement({
    title: "TEST Announcement - Dues Reminder",
    content: "TEST announcement for monthly dues reminder and portal verification.",
    createdById: admin.id,
    sendEmail: false,
    postToFacebook: false,
  });
  await upsertAnnouncement({
    title: "TEST Announcement - Community Notice",
    content: "TEST announcement for community notice and portal verification.",
    createdById: admin.id,
    sendEmail: false,
    postToFacebook: false,
  });

  await upsertEvent({
    title: "TEST Event - General Assembly",
    description: "TEST event for general assembly workflow verification.",
    eventDate: utcDate(2026, 7, 12),
    eventTime: "09:00",
    location: "TEST HOA Clubhouse",
    createdById: admin.id,
    postToFacebook: false,
  });
  await upsertEvent({
    title: "TEST Event - Clean-up Drive",
    description: "TEST event for clean-up activity workflow verification.",
    eventDate: utcDate(2026, 7, 20),
    eventTime: "06:30",
    location: "TEST Main Gate",
    createdById: admin.id,
    postToFacebook: false,
  });

  const summary = {
    password: TEST_PASSWORD,
    homeowners: await prisma.homeownerProfile.count({ where: { user: { email: { in: homeownerInputs.map((item) => item.email) } } } }),
    bills: await prisma.bill.count({ where: { notes: { contains: "TEST monthly dues" } } }),
    payments: await prisma.payment.count({ where: { referenceNumber: { startsWith: "TEST-PAY-" } } }),
    paymentRequests: await prisma.paymentRequest.count({ where: { referenceNumber: { startsWith: "TEST-QR-" } } }),
    collections: await prisma.collection.count({ where: { referenceNumber: { startsWith: "TEST-" } } }),
    contractors: await prisma.contractorProfile.count({ where: { companyName: { startsWith: "TEST " } } }),
    vehicles: await prisma.vehicle.count({ where: { plateNumber: { startsWith: "TEST-" } } }),
    employees: await prisma.employeeProfile.count({ where: { employeeNumber: { startsWith: "TEST-EMP-" } } }),
    attendance: await prisma.attendance.count({ where: { employee: { employeeNumber: { startsWith: "TEST-EMP-" } } } }),
    payrollPeriods: await prisma.payrollPeriod.count({ where: { startDate: { gte: utcDate(2026, 6, 1), lte: utcDate(2026, 6, 30) } } }),
    payrollDeductions: await prisma.payrollDeduction.count({ where: { employee: { employeeNumber: { startsWith: "TEST-EMP-" } } } }),
    employeeLoans: await prisma.employeeLoan.count({ where: { employee: { employeeNumber: { startsWith: "TEST-EMP-" } } } }),
    payslips: await prisma.payslip.count({ where: { employee: { employeeNumber: { startsWith: "TEST-EMP-" } } } }),
    expenses: await prisma.expense.count({ where: { voucherNumber: { startsWith: "TEST-CV-" } } }),
    announcements: await prisma.announcement.count({ where: { title: { startsWith: "TEST Announcement" } } }),
    events: await prisma.event.count({ where: { title: { startsWith: "TEST Event" } } }),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
