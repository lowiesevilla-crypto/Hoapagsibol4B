import { BillStatus, HomeownerStatus, PaymentMethod, PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const TEST_PASSWORD = "ChangeMe123!";

async function assignReceiptNumber(paymentId: string, paymentDate: Date) {
  const existing = await prisma.payment.findUnique({ where: { id: paymentId }, select: { receiptNumber: true } });
  if (existing?.receiptNumber) return existing.receiptNumber;

  return prisma.$transaction(async (tx) => {
    const year = paymentDate.getUTCFullYear();
    const counter = await tx.receiptCounter.upsert({
      where: { series_year: { series: "MD", year } },
      create: { series: "MD", year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const receiptNumber = `AR-MD-${year}-${String(counter.lastNumber).padStart(7, "0")}`;
    await tx.payment.update({ where: { id: paymentId }, data: { receiptNumber } });
    return receiptNumber;
  });
}

async function main() {
  const passwordHash = await hash(TEST_PASSWORD, 12);

  const testHomeowners = [
    {
      name: "Test Homeowner One",
      email: "test.homeowner1@pagsibol.test",
      phone: "09170000001",
      address: "Block T, Lot 1, Pagsibol Village PH2 4B East",
      block: "T",
      lot: "1",
      monthlyDuesAmount: 1000,
      billStatus: BillStatus.PAID,
      amountPaid: 1000,
      referenceNumber: "TEST-PAY-0001",
    },
    {
      name: "Test Homeowner Two",
      email: "test.homeowner2@pagsibol.test",
      phone: "09170000002",
      address: "Block T, Lot 2, Pagsibol Village PH2 4B East",
      block: "T",
      lot: "2",
      monthlyDuesAmount: 1000,
      billStatus: BillStatus.UNPAID,
      amountPaid: 0,
      referenceNumber: null,
    },
  ] as const;

  const billingMonth = new Date(Date.UTC(2026, 5, 1));
  const dueDate = new Date(Date.UTC(2026, 5, 30));
  const paymentDate = new Date(Date.UTC(2026, 5, 24));

  for (const testHomeowner of testHomeowners) {
    const user = await prisma.user.upsert({
      where: { email: testHomeowner.email },
      update: {
        name: testHomeowner.name,
        role: Role.HOMEOWNER,
        passwordHash,
      },
      create: {
        name: testHomeowner.name,
        email: testHomeowner.email,
        role: Role.HOMEOWNER,
        passwordHash,
      },
    });

    const profile = await prisma.homeownerProfile.upsert({
      where: { userId: user.id },
      update: {
        address: testHomeowner.address,
        block: testHomeowner.block,
        lot: testHomeowner.lot,
        phone: testHomeowner.phone,
        messengerId: `test_${testHomeowner.block}_${testHomeowner.lot}`,
        status: HomeownerStatus.ACTIVE,
        monthlyDuesAmount: testHomeowner.monthlyDuesAmount,
      },
      create: {
        userId: user.id,
        address: testHomeowner.address,
        block: testHomeowner.block,
        lot: testHomeowner.lot,
        phone: testHomeowner.phone,
        messengerId: `test_${testHomeowner.block}_${testHomeowner.lot}`,
        status: HomeownerStatus.ACTIVE,
        monthlyDuesAmount: testHomeowner.monthlyDuesAmount,
      },
    });

    const totalAmount = testHomeowner.monthlyDuesAmount;
    const amountPaid = testHomeowner.amountPaid;
    const balance = totalAmount - amountPaid;

    const bill = await prisma.bill.upsert({
      where: {
        homeownerId_billingMonth: {
          homeownerId: profile.id,
          billingMonth,
        },
      },
      update: {
        amount: totalAmount,
        penalty: 0,
        totalAmount,
        amountPaid,
        balance,
        dueDate,
        status: testHomeowner.billStatus,
        notes: "Test monthly dues bill for portal verification.",
      },
      create: {
        homeownerId: profile.id,
        billingMonth,
        amount: totalAmount,
        penalty: 0,
        totalAmount,
        amountPaid,
        balance,
        dueDate,
        status: testHomeowner.billStatus,
        notes: "Test monthly dues bill for portal verification.",
      },
    });

    if (testHomeowner.amountPaid > 0 && testHomeowner.referenceNumber) {
      const payment = await prisma.payment.findFirst({
        where: { billId: bill.id, referenceNumber: testHomeowner.referenceNumber },
      });

      const savedPayment =
        payment ??
        (await prisma.payment.create({
          data: {
            billId: bill.id,
            homeownerId: profile.id,
            amount: testHomeowner.amountPaid,
            paymentDate,
            method: PaymentMethod.GCASH,
            referenceNumber: testHomeowner.referenceNumber,
            remarks: "Test payment for portal verification.",
          },
        }));

      await assignReceiptNumber(savedPayment.id, paymentDate);
    }
  }

  const summary = await prisma.homeownerProfile.findMany({
    where: {
      user: { email: { in: testHomeowners.map((item) => item.email) } },
    },
    include: {
      user: { select: { name: true, email: true } },
      bills: { select: { billingMonth: true, totalAmount: true, amountPaid: true, balance: true, status: true } },
      payments: { select: { amount: true, paymentDate: true, method: true, referenceNumber: true, receiptNumber: true } },
    },
    orderBy: { lot: "asc" },
  });

  console.log(JSON.stringify({ password: TEST_PASSWORD, homeowners: summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
