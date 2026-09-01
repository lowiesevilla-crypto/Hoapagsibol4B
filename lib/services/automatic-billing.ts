import { BillingGenerationMode, Prisma, RecurringChargeType, Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { findEffectiveBillingRule, generateBillingFromRules } from "@/lib/services/billing-rules";

type AutomationActor = { id: string; tenantId: string; name: string; email: string };
type RentalAgreementRow = {
  id: string;
  renterId: string;
  assetCode: string;
  monthlyRate: Prisma.Decimal | number | string;
  dueDay: number;
};
type RenterRow = { id: string; fullName: string; homeownerId: string | null; status: string };
type RentalInvoiceRow = { id: string; balance: Prisma.Decimal | number | string; amountPaid: Prisma.Decimal | number | string; dueDate: Date };
type CollectionRow = { id: string; amount: Prisma.Decimal | number | string; payerType: string; payerName: string | null; homeownerId: string | null };
type SumRow = { total: Prisma.Decimal | number | string | null };
type ExistingAllocationRow = { id: string; amount: Prisma.Decimal | number | string };

const HOMEOWNER_BATCH_SIZE = 250;
const AUTOMATION_ROLES = [Role.SYSTEM_ADMIN, Role.ADMIN, Role.HOA_ADMIN, Role.BILLING_MANAGER];

export type AutomaticBillingResult = {
  period: string;
  billingDay: number;
  actorId: string | null;
  monthlyDues: {
    enabled: boolean;
    dueToday: boolean;
    skippedReason?: string;
    eligible: number;
    created: number;
    duplicates: number;
    exemptions: number;
    failed: number;
  };
  rentals: {
    enabled: boolean;
    created: number;
    autoApplied: number;
    agreementsDue: number;
  };
};

export async function runAutomaticBillingForTenant(tenantId: string, now = new Date()): Promise<AutomaticBillingResult> {
  const clock = manilaClock(now);
  const period = `${clock.year}-${String(clock.month).padStart(2, "0")}`;
  const rule = await findEffectiveBillingRule(tenantId, RecurringChargeType.MONTHLY_DUES, clock.year, clock.month);
  const enabled = rule?.generationMode === BillingGenerationMode.AUTOMATIC;
  const actor = enabled ? await resolveAutomationActor(tenantId) : null;

  const result: AutomaticBillingResult = {
    period,
    billingDay: rule?.billingDay ?? 1,
    actorId: actor?.id ?? null,
    monthlyDues: { enabled, dueToday: false, eligible: 0, created: 0, duplicates: 0, exemptions: 0, failed: 0 },
    rentals: { enabled, created: 0, autoApplied: 0, agreementsDue: 0 },
  };

  if (!rule) {
    result.monthlyDues.skippedReason = "No active monthly dues rule covers this month.";
    result.rentals.enabled = false;
    return result;
  }
  if (!enabled) {
    result.monthlyDues.skippedReason = "Automatic billing is switched off for the effective monthly dues rule.";
    result.rentals.enabled = false;
    return result;
  }
  if (!actor) {
    result.monthlyDues.skippedReason = "No active tenant billing administrator is available for automatic audit attribution.";
    result.rentals.enabled = false;
    return result;
  }

  // Catch up after the configured day if a scheduled run was missed. Every run
  // reconciles the current eligible population so late activations and prior
  // row-level failures are picked up. Database uniqueness plus duplicate checks
  // make repeated reconciliation safe for homeowners already billed this month.
  result.monthlyDues.dueToday = clock.day >= rule.billingDay;
  if (result.monthlyDues.dueToday) {
    const dues = await runAutomaticMonthlyDues(actor, clock.year, clock.month);
    Object.assign(result.monthlyDues, dues);
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        module: "BILLING",
        action: dues.failed === 0 ? "AUTOMATIC_MONTHLY_DUES_COMPLETED" : "AUTOMATIC_MONTHLY_DUES_PARTIAL",
        entityType: "BillingRule",
        entityId: rule.id,
        metadata: { period, billingDay: rule.billingDay, batchSize: HOMEOWNER_BATCH_SIZE, reconciliation: true, ...dues },
      },
    });
  } else {
    result.monthlyDues.skippedReason = `Scheduled for day ${rule.billingDay} of the month.`;
  }

  // Rental agreements already carry their own billing day. The tenant's
  // automatic billing switch enables the scheduler; only agreements whose day
  // has arrived are generated. INSERT IGNORE keeps month generation idempotent.
  const rental = await runAutomaticRentalBilling(tenantId, actor, clock.year, clock.month, clock.day);
  result.rentals = { enabled: true, ...rental };
  return result;
}

async function runAutomaticMonthlyDues(actor: AutomationActor, year: number, month: number) {
  const homeowners = await prisma.homeownerProfile.findMany({
    where: { tenantId: actor.tenantId, status: "ACTIVE" },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  let created = 0;
  let duplicates = 0;
  let exemptions = 0;
  let failed = 0;
  for (let index = 0; index < homeowners.length; index += HOMEOWNER_BATCH_SIZE) {
    const homeownerIds = homeowners.slice(index, index + HOMEOWNER_BATCH_SIZE).map((item) => item.id);
    const batch = await generateBillingFromRules({ actor, coverageYear: year, coverageMonth: month, scope: "SELECTED", homeownerIds });
    created += batch.createdCount;
    duplicates += batch.duplicateCount;
    exemptions += batch.exemptCount;
    failed += batch.failedCount;
  }
  return { eligible: homeowners.length, created, duplicates, exemptions, failed };
}

async function runAutomaticRentalBilling(tenantId: string, actor: AutomationActor, year: number, month: number, currentDay: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  let created = 0;
  let autoApplied = 0;
  let agreementsDue = 0;

  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Prisma.TransactionClient;
    const agreements = await db.$queryRaw<RentalAgreementRow[]>(Prisma.sql`
      SELECT a.id,a.renterId,ra.code AS assetCode,a.monthlyRate,a.dueDay
      FROM RentalAgreement a
      JOIN RentalAsset ra ON ra.tenantId=a.tenantId AND ra.id=a.assetId
      WHERE a.tenantId=${tenantId} AND a.status='ACTIVE'
        AND a.billingDay<=${currentDay}
        AND a.startDate<=${end} AND (a.endDate IS NULL OR a.endDate>=${start})
      ORDER BY a.billingDay,a.id
      FOR UPDATE
    `);
    agreementsDue = agreements.length;

    for (const agreement of agreements) {
      const amount = roundMoney(Number(agreement.monthlyRate));
      const number = rentalInvoiceNumber(start, agreement.id);
      const dueDate = dayInMonth(year, month, agreement.dueDay);
      const inserted = await db.$executeRaw(Prisma.sql`
        INSERT IGNORE INTO RentalInvoice
          (tenantId,id,agreementId,invoiceNumber,chargeType,periodStart,periodEnd,dueDate,amount,amountPaid,balance,status,notes,createdAt,updatedAt)
        VALUES
          (${tenantId},${randomUUID()},${agreement.id},${number},'RENT',${start},${end},${dueDate},${amount},0,${amount},'OPEN',${`Monthly rent - ${agreement.assetCode} · Automatic billing`},NOW(3),NOW(3))
      `);
      created += inserted;
    }

    const renterIds = [...new Set(agreements.map((item) => item.renterId))];
    for (const renterId of renterIds) {
      const renterRows = await db.$queryRaw<RenterRow[]>(Prisma.sql`
        SELECT id,fullName,homeownerId,status FROM Renter
        WHERE tenantId=${tenantId} AND id=${renterId} FOR UPDATE
      `);
      const renter = renterRows[0];
      if (!renter || renter.status !== "ACTIVE") continue;
      autoApplied += await applyRentalAdvanceCredits(db, tenantId, actor.id, renter);
    }

    await db.$executeRaw(Prisma.sql`
      UPDATE RentalInvoice SET status='OVERDUE',updatedAt=NOW(3)
      WHERE tenantId=${tenantId} AND dueDate<CURDATE() AND balance>0 AND status IN ('OPEN','PARTIAL')
    `);
    if (created > 0 || autoApplied > 0) {
      await db.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          module: "RENTALS",
          action: "AUTOMATIC_RENTAL_BILLING",
          entityType: "RentalInvoice",
          metadata: { period: `${year}-${String(month).padStart(2, "0")}`, currentDay, agreementsDue, created, autoApplied: roundMoney(autoApplied), strategy: "AGREEMENT_BILLING_DAY_OLDEST_DUE_FIRST" },
        },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000 });

  return { created, autoApplied: roundMoney(autoApplied), agreementsDue };
}

async function applyRentalAdvanceCredits(db: Prisma.TransactionClient, tenantId: string, actorId: string, renter: RenterRow) {
  const invoices = await db.$queryRaw<RentalInvoiceRow[]>(Prisma.sql`
    SELECT i.id,i.balance,i.amountPaid,i.dueDate
    FROM RentalInvoice i
    JOIN RentalAgreement a ON a.tenantId=i.tenantId AND a.id=i.agreementId
    WHERE i.tenantId=${tenantId} AND a.renterId=${renter.id} AND i.chargeType='RENT'
      AND i.balance>0 AND i.status IN ('OPEN','PARTIAL','OVERDUE')
    ORDER BY i.dueDate,i.periodStart,i.createdAt
    FOR UPDATE
  `);
  if (!invoices.length) return 0;

  const collections = renter.homeownerId
    ? await db.$queryRaw<CollectionRow[]>(Prisma.sql`
        SELECT id,amount,payerType,payerName,homeownerId FROM Collection
        WHERE tenantId=${tenantId} AND type='OTHER' AND refundable=FALSE AND description='Rental payment'
          AND payerType='HOMEOWNER' AND homeownerId=${renter.homeownerId}
        ORDER BY collectionDate,createdAt FOR UPDATE
      `)
    : await db.$queryRaw<CollectionRow[]>(Prisma.sql`
        SELECT id,amount,payerType,payerName,homeownerId FROM Collection
        WHERE tenantId=${tenantId} AND type='OTHER' AND refundable=FALSE AND description='Rental payment'
          AND payerType='RENTER'
        ORDER BY collectionDate,createdAt FOR UPDATE
      `);

  let applied = 0;
  for (const collection of collections) {
    if (!renter.homeownerId && normalizeName(collection.payerName) !== normalizeName(renter.fullName)) continue;
    const allocatedRows = await db.$queryRaw<SumRow[]>(Prisma.sql`
      SELECT COALESCE(SUM(amount),0) AS total FROM RentalPaymentAllocation
      WHERE tenantId=${tenantId} AND collectionId=${collection.id}
    `);
    let available = roundMoney(Number(collection.amount) - Number(allocatedRows[0]?.total ?? 0));
    if (available <= 0) continue;

    for (const invoice of invoices) {
      let balance = roundMoney(Number(invoice.balance));
      if (balance <= 0 || available <= 0) continue;
      const amount = roundMoney(Math.min(balance, available));
      const existingRows = await db.$queryRaw<ExistingAllocationRow[]>(Prisma.sql`
        SELECT id,amount FROM RentalPaymentAllocation
        WHERE tenantId=${tenantId} AND invoiceId=${invoice.id} AND collectionId=${collection.id}
        FOR UPDATE
      `);
      const existing = existingRows[0];
      if (existing) {
        await db.$executeRaw(Prisma.sql`
          UPDATE RentalPaymentAllocation SET amount=${roundMoney(Number(existing.amount) + amount)}
          WHERE tenantId=${tenantId} AND id=${existing.id}
        `);
      } else {
        await db.$executeRaw(Prisma.sql`
          INSERT INTO RentalPaymentAllocation (tenantId,id,invoiceId,collectionId,amount,createdById,createdAt)
          VALUES (${tenantId},${randomUUID()},${invoice.id},${collection.id},${amount},${actorId},NOW(3))
        `);
      }
      balance = roundMoney(balance - amount);
      const paid = roundMoney(Number(invoice.amountPaid) + amount);
      await db.$executeRaw(Prisma.sql`
        UPDATE RentalInvoice SET amountPaid=${paid},balance=${balance},status=${balance <= 0 ? "PAID" : "PARTIAL"},updatedAt=NOW(3)
        WHERE tenantId=${tenantId} AND id=${invoice.id}
      `);
      invoice.amountPaid = paid;
      invoice.balance = balance;
      available = roundMoney(available - amount);
      applied = roundMoney(applied + amount);
    }
  }
  return applied;
}

async function resolveAutomationActor(tenantId: string): Promise<AutomationActor | null> {
  const actor = await prisma.user.findFirst({
    where: { tenantId, active: true, role: { in: AUTOMATION_ROLES } },
    select: { id: true, tenantId: true, name: true, email: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return actor;
}

function manilaClock(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function dayInMonth(year: number, month: number, day: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, last)));
}

function rentalInvoiceNumber(period: Date, agreementId: string) {
  const ym = period.toISOString().slice(0, 7).replace("-", "");
  return `RENT-${ym}-${agreementId.replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase()}`;
}

function normalizeName(value: string | null | undefined) {
  return (value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-PH").replace(/[^a-z0-9]+/g, " ").trim();
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
