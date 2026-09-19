import { Role } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformPaymentReceiptActions } from "@/components/platform-payment-receipt-actions";
import { requireUser } from "@/lib/auth";
import { getTenantPlatformManualPaymentReceipt } from "@/lib/services/platform-manual-payment";
import { platformBillingIssuer } from "@/lib/services/platform-invoice-document";

function money(value: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function externalReference(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const value = (metadata as Record<string, unknown>).externalReference;
  return typeof value === "string" ? value.trim() : "";
}

export default async function TenantAdminPlatformManualPaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser(Role.ADMIN);
  const { id } = await params;
  const payment = await getTenantPlatformManualPaymentReceipt(id, user.tenantId).catch(() => null);
  if (!payment) notFound();

  const allocation = payment.allocations[0];
  if (!allocation) notFound();
  const invoice = allocation.invoice;
  const externalRef = externalReference(payment.metadata);
  const issuer = platformBillingIssuer();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="print:hidden mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link className="font-black text-blue-700 hover:underline" href="/admin/subscription">
          ← Back to HOAHub subscription
        </Link>
        <PlatformPaymentReceiptActions />
      </div>

      <article className="rounded-2xl border bg-white p-6 shadow-sm print:border-0 print:shadow-none sm:p-8">
        <header className="border-b pb-5 text-center">
          <div className="mx-auto flex max-w-xl flex-col items-center">
            <Image src="/Hoahub-logo.png" alt="HOAHub platform logo" width={72} height={72} className="h-16 w-16 object-contain print:h-14 print:w-14" priority />
            <p className="mt-2 text-xs font-black uppercase tracking-[0.22em] text-leaf-700">{issuer.name}</p>
            {issuer.address ? <p className="mt-1 max-w-lg text-xs leading-5 text-slate-600">{issuer.address}</p> : null}
            <p className="text-xs text-slate-500">{[issuer.email, issuer.website].filter(Boolean).join(" · ")}</p>
          </div>
          <h1 className="mt-3 text-2xl font-black text-slate-950">Official Manual Payment Receipt</h1>
          <p className="mt-1 text-sm text-slate-500">Tenant subscription payment</p>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <Detail label="Tenant" value={payment.tenant.name} />
          <Detail label="Payment reference" value={payment.paymentReference} />
          <Detail label="Invoice" value={invoice.invoiceNumber} />
          <Detail label="Payment method" value={payment.method.replaceAll("_", " ")} />
          <Detail label="Amount received" value={money(Number(payment.amount), payment.currency)} strong />
          <Detail label="Payment date" value={(payment.paidAt || payment.receivedAt).toLocaleString("en-PH")} />
          {externalRef ? <Detail label="External reference" value={externalRef} /> : null}
          <Detail label="Status" value={payment.status} />
        </section>

        <section className="mt-6 rounded-xl bg-slate-50 p-4">
          <h2 className="font-black text-slate-950">Invoice allocation</h2>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <Detail label="Invoice total" value={money(Number(invoice.total), invoice.currency)} />
            <Detail label="Total paid to date" value={money(Number(invoice.amountPaid), invoice.currency)} />
            <Detail label="Remaining balance" value={money(Number(invoice.outstandingBalance), invoice.currency)} strong />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Coverage: {invoice.billingPeriodStart.toLocaleDateString("en-PH")} – {invoice.billingPeriodEnd.toLocaleDateString("en-PH")}
          </p>
        </section>

        <footer className="mt-8 border-t pt-4 text-center text-xs text-slate-500">
          This receipt is generated from the HOAHub platform payment ledger after the manual payment transaction is committed.
        </footer>
      </article>
    </div>
  );
}

function Detail({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 break-words ${strong ? "text-lg font-black text-pine-950" : "font-semibold text-slate-900"}`}>{value}</p>
    </div>
  );
}
