"use server";

import {
  PlatformInvoiceStatus,
  Role,
  TenantStatus,
  TenantSubscriptionStatus,
  TenantSuspensionReason,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { platformPrisma as prisma } from "@/lib/db";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function moneyValue(value: FormDataEntryValue | null, label: string, allowZero = true) {
  const parsed = Number(clean(value));
  if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return Math.round(parsed * 100) / 100;
}

function dateValue(value: FormDataEntryValue | null, label: string) {
  const raw = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`Choose a valid ${label}.`);
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Choose a valid ${label}.`);
  return date;
}

async function requirePlatformBillingUser() {
  const user = await requireUser();
  if (!user.roles.includes(Role.SUPER_ADMIN) && !user.roles.includes(Role.PLATFORM_ADMIN)) {
    redirect("/admin/dashboard");
  }
  return user;
}

function billingUrl(tenantId: string, kind: "success" | "error", message: string) {
  return `/platform/tenants/${tenantId}/billing?${kind}=${encodeURIComponent(message)}`;
}

function revalidateBilling(tenantId: string) {
  revalidatePath("/platform/tenants");
  revalidatePath("/platform/subscriptions");
  revalidatePath("/platform/invoices");
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/platform/tenants/${tenantId}/billing`);
  revalidatePath("/admin/subscription");
}

export async function updatePlatformInvoiceAction(formData: FormData) {
  const actor = await requirePlatformBillingUser();
  const tenantId = clean(formData.get("tenantId"));
  const invoiceId = clean(formData.get("invoiceId"));

  try {
    const issueDate = dateValue(formData.get("issueDate"), "issue date");
    const dueDate = dateValue(formData.get("dueDate"), "due date");
    if (dueDate < issueDate) throw new Error("Due date cannot be earlier than the issue date.");

    const subtotal = moneyValue(formData.get("subtotal"), "subtotal", false);
    const discount = moneyValue(formData.get("discount"), "discount");
    const tax = moneyValue(formData.get("tax"), "tax");
    if (discount > subtotal) throw new Error("Discount cannot exceed the subtotal.");
    const total = Math.round((subtotal - discount + tax) * 100) / 100;
    if (total <= 0) throw new Error("Invoice total must be greater than zero.");

    const notes = clean(formData.get("notes")) || null;
    const lineDescription = clean(formData.get("lineDescription")) || "HOAHub subscription";

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.platformInvoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: { lines: { orderBy: { createdAt: "asc" } }, _count: { select: { allocations: true } } },
      });
      if (!invoice) throw new Error("Platform invoice not found.");
      if (Number(invoice.amountPaid) > 0 || invoice._count.allocations > 0) {
        throw new Error("An invoice with payment history cannot be financially edited. Correct or void the payment first.");
      }
      if ([PlatformInvoiceStatus.PAID, PlatformInvoiceStatus.VOID, PlatformInvoiceStatus.CANCELLED].includes(invoice.status)) {
        throw new Error("This closed invoice cannot be edited.");
      }

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const status = dueDate < today ? PlatformInvoiceStatus.OVERDUE : PlatformInvoiceStatus.OPEN;

      await tx.platformInvoice.update({
        where: { id: invoice.id },
        data: {
          issueDate,
          dueDate,
          subtotal,
          discount,
          tax,
          total,
          outstandingBalance: total,
          status,
          notes,
        },
      });

      const primaryLine = invoice.lines[0];
      if (primaryLine) {
        await tx.platformInvoiceLine.update({
          where: { id: primaryLine.id },
          data: { description: lineDescription, quantity: 1, unitAmount: subtotal, lineTotal: subtotal },
        });
      } else {
        await tx.platformInvoiceLine.create({
          data: { invoiceId: invoice.id, description: lineDescription, quantity: 1, unitAmount: subtotal, lineTotal: subtotal },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          module: "PLATFORM_BILLING",
          action: "PLATFORM_INVOICE_UPDATED",
          entityType: "PlatformInvoice",
          entityId: invoice.id,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            before: {
              issueDate: invoice.issueDate,
              dueDate: invoice.dueDate,
              subtotal: Number(invoice.subtotal),
              discount: Number(invoice.discount),
              tax: Number(invoice.tax),
              total: Number(invoice.total),
              notes: invoice.notes,
            },
            after: { issueDate, dueDate, subtotal, discount, tax, total, notes, lineDescription, status },
          },
        },
      });
    });
  } catch (error) {
    redirect(billingUrl(tenantId, "error", error instanceof Error ? error.message : "Invoice update failed."));
  }

  revalidateBilling(tenantId);
  redirect(billingUrl(tenantId, "success", "Platform invoice updated."));
}

export async function deletePlatformInvoiceAction(formData: FormData) {
  const actor = await requirePlatformBillingUser();
  const tenantId = clean(formData.get("tenantId"));
  const invoiceId = clean(formData.get("invoiceId"));

  try {
    await prisma.$transaction(async (tx) => {
      const invoice = await tx.platformInvoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: { _count: { select: { allocations: true } } },
      });
      if (!invoice) throw new Error("Platform invoice not found.");
      if (Number(invoice.amountPaid) > 0 || invoice._count.allocations > 0) {
        throw new Error("An invoice with payment history cannot be deleted. Preserve it for the financial audit trail.");
      }
      if ([PlatformInvoiceStatus.PAID, PlatformInvoiceStatus.PARTIALLY_PAID].includes(invoice.status)) {
        throw new Error("Paid or partially paid invoices cannot be deleted.");
      }

      const latest = await tx.platformInvoice.findFirst({
        where: { subscriptionId: invoice.subscriptionId },
        orderBy: [{ billingPeriodStart: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      });
      if (!latest || latest.id !== invoice.id) {
        throw new Error("Only the latest unpaid invoice in a subscription can be deleted. Older invoices are history-protected.");
      }

      const previous = await tx.platformInvoice.findFirst({
        where: { subscriptionId: invoice.subscriptionId, id: { not: invoice.id } },
        orderBy: [{ billingPeriodStart: "desc" }, { createdAt: "desc" }],
        select: { billingPeriodStart: true, billingPeriodEnd: true },
      });

      await tx.platformInvoice.delete({ where: { id: invoice.id } });
      await tx.tenantSubscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          currentPeriodStart: previous?.billingPeriodStart ?? invoice.billingPeriodStart,
          currentPeriodEnd: previous?.billingPeriodEnd ?? null,
          nextBillingDate: invoice.billingPeriodStart,
        },
      });

      const remainingOutstanding = await tx.platformInvoice.findFirst({
        where: {
          tenantId,
          outstandingBalance: { gt: 0 },
          status: { in: [PlatformInvoiceStatus.OPEN, PlatformInvoiceStatus.PARTIALLY_PAID, PlatformInvoiceStatus.OVERDUE] },
        },
        select: { id: true },
      });

      if (!remainingOutstanding) {
        await tx.tenantSubscription.updateMany({
          where: {
            tenantId,
            status: { in: [TenantSubscriptionStatus.PAST_DUE, TenantSubscriptionStatus.GRACE, TenantSubscriptionStatus.RESTRICTED] },
          },
          data: { status: TenantSubscriptionStatus.ACTIVE },
        });

        const activeSuspensions = await tx.tenantSuspensionRecord.findMany({
          where: { tenantId, reinstatedAt: null },
          select: { id: true, reason: true },
        });
        const nonPaymentOnly = activeSuspensions.length > 0 && activeSuspensions.every((item) => item.reason === TenantSuspensionReason.NON_PAYMENT);
        if (nonPaymentOnly) {
          const now = new Date();
          await tx.tenantSuspensionRecord.updateMany({
            where: { tenantId, reinstatedAt: null, reason: TenantSuspensionReason.NON_PAYMENT },
            data: { reinstatedAt: now, reinstatedById: actor.id },
          });
          await tx.tenant.update({ where: { id: tenantId }, data: { status: TenantStatus.ACTIVE, subscriptionStatus: TenantSubscriptionStatus.ACTIVE } });
        } else {
          await tx.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: TenantSubscriptionStatus.ACTIVE } });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          module: "PLATFORM_BILLING",
          action: "PLATFORM_INVOICE_DELETED",
          entityType: "PlatformInvoice",
          entityId: invoice.id,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            subscriptionId: invoice.subscriptionId,
            billingPeriodStart: invoice.billingPeriodStart,
            billingPeriodEnd: invoice.billingPeriodEnd,
            total: Number(invoice.total),
            priorStatus: invoice.status,
            scheduleResetTo: invoice.billingPeriodStart,
          },
        },
      });
    });
  } catch (error) {
    redirect(billingUrl(tenantId, "error", error instanceof Error ? error.message : "Invoice deletion failed."));
  }

  revalidateBilling(tenantId);
  redirect(billingUrl(tenantId, "success", "Platform invoice deleted and the subscription billing schedule was restored."));
}
