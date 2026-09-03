import { PlatformInvoiceStatus, TenantSubscriptionStatus } from "@prisma/client";
import { generateTenantInvoiceAction } from "@/lib/actions/platform-billing";
import { platformPrisma as prisma } from "@/lib/db";

export async function PlatformManualPaymentAvailabilityPanel({ tenantId }: { tenantId: string }) {
  const [openInvoice, subscription] = await Promise.all([
    prisma.platformInvoice.findFirst({
      where: {
        tenantId,
        outstandingBalance: { gt: 0 },
        status: { in: [PlatformInvoiceStatus.OPEN, PlatformInvoiceStatus.PARTIALLY_PAID, PlatformInvoiceStatus.OVERDUE] },
      },
      select: { id: true },
    }),
    prisma.tenantSubscription.findFirst({
      where: {
        tenantId,
        status: { notIn: [TenantSubscriptionStatus.CANCELLED, TenantSubscriptionStatus.EXPIRED] },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (openInvoice) return null;

  return (
    <section className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
      <h2 className="text-base font-black text-amber-950">Manual payment recording needs an open invoice</h2>
      <p className="mt-1 text-sm leading-6 text-amber-900">
        There is currently no OPEN, PARTIALLY PAID, or OVERDUE platform invoice with a remaining balance for this tenant. HOAHub records manual tenant subscription payments against an invoice so the payment allocation, invoice balance, and audit trail stay consistent.
      </p>
      {subscription ? (
        <form action={generateTenantInvoiceAction} className="mt-3">
          <input type="hidden" name="tenantId" value={tenantId} />
          <button className="min-h-10 rounded-xl bg-amber-700 px-4 py-2 text-sm font-black text-white hover:bg-amber-800">Generate bill so payment can be recorded</button>
        </form>
      ) : (
        <p className="mt-3 rounded-xl bg-white p-3 text-sm font-bold text-amber-950">Assign an active subscription first, then generate the tenant invoice.</p>
      )}
    </section>
  );
}
