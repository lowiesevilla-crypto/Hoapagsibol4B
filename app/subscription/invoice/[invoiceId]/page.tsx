import { CheckCircle2, CircleDollarSign } from "lucide-react";
import { notFound } from "next/navigation";
import { PlatformInvoiceDocumentActions } from "@/components/platform-invoice-document-actions";
import {
  getPlatformInvoiceDocument,
  platformBillingIssuer,
  platformInvoicePdfUrl,
  verifyPlatformInvoiceDocumentToken,
} from "@/lib/services/platform-invoice-document";

function money(value: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function date(value: Date) {
  return value.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

export default async function PlatformInvoiceDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { invoiceId } = await params;
  const query = await searchParams;
  const token = String(query.token || "");
  if (!verifyPlatformInvoiceDocumentToken(invoiceId, token)) notFound();

  const invoice = await getPlatformInvoiceDocument(invoiceId);
  if (!invoice) notFound();

  const issuer = platformBillingIssuer();
  const profile = invoice.tenant.billingProfile;
  const billingName = profile?.legalBusinessName || invoice.tenant.name;
  const billingAddress = profile?.billingAddress || invoice.tenant.address || "Address not configured";
  const billingEmail = profile?.billingEmail || invoice.tenant.email || "Email not configured";
  const billingTin = profile?.tinNumber || invoice.tenant.tinNumber || "";
  const paid = Number(invoice.outstandingBalance) < 0.01;
  const statusStyle = paid
    ? "bg-emerald-100 text-emerald-800"
    : invoice.status === "OVERDUE"
      ? "bg-rose-100 text-rose-800"
      : "bg-amber-100 text-amber-900";

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 text-slate-900 sm:px-6 sm:py-10 print:bg-white print:p-0">
      <style>{`@page { size: A4; margin: 12mm; } @media print { html, body { background: white !important; } }`}</style>
      <div className="mx-auto mb-4 max-w-[210mm] print:hidden">
        <PlatformInvoiceDocumentActions pdfUrl={platformInvoicePdfUrl(invoice.id)} />
      </div>

      <article className="mx-auto min-h-[297mm] max-w-[210mm] overflow-hidden bg-white shadow-xl print:min-h-0 print:max-w-none print:shadow-none">
        <header className="bg-pine-900 px-7 py-7 text-white sm:px-10 sm:py-9 print:px-0 print:py-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-leaf-100">HOAHub secure billing</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{issuer.name}</h1>
              <p className="mt-2 text-sm font-semibold text-sky-100">Tenant Management &amp; HOA Digital Platform</p>
            </div>
            <div className="min-w-[210px] text-left sm:text-right">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-100">Invoice</p>
              <p className="mt-2 text-xl font-black">{invoice.invoiceNumber}</p>
              <span className={`mt-3 inline-flex rounded-full px-3 py-1.5 text-xs font-black ${statusStyle}`}>{invoice.status.replaceAll("_", " ")}</span>
            </div>
          </div>
        </header>

        <div className="px-7 py-7 sm:px-10 sm:py-9 print:px-0 print:py-6">
          <section className="grid gap-7 border-b border-slate-200 pb-7 sm:grid-cols-2">
            <PartyBlock
              label="From"
              name={issuer.name}
              lines={[issuer.address, issuer.email, issuer.contactNumber, issuer.tinNumber ? `TIN: ${issuer.tinNumber}` : "", issuer.website]}
            />
            <PartyBlock
              label="Bill to"
              name={billingName}
              lines={[
                billingAddress,
                billingEmail,
                profile?.contactPerson ? `Contact: ${profile.contactPerson}` : "",
                profile?.contactNumber || invoice.tenant.contactNumber || "",
                billingTin ? `TIN: ${billingTin}` : "",
                profile?.vatStatus || "",
              ]}
            />
          </section>

          <section className="mt-7 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2 lg:grid-cols-4 print:bg-white">
            <Meta label="Invoice date" value={date(invoice.issueDate)} />
            <Meta label="Due date" value={date(invoice.dueDate)} />
            <Meta label="Billing period" value={`${date(invoice.billingPeriodStart)} – ${date(invoice.billingPeriodEnd)}`} />
            <Meta label="Plan" value={invoice.subscription.plan.name} />
          </section>

          <section className="mt-8">
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-pine-900 text-left text-white">
                  <tr>
                    <th className="px-4 py-3 text-xs font-black uppercase tracking-wider sm:px-5">Description</th>
                    <th className="px-3 py-3 text-right text-xs font-black uppercase tracking-wider">Qty</th>
                    <th className="px-3 py-3 text-right text-xs font-black uppercase tracking-wider">Unit price</th>
                    <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider sm:px-5">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.id} className="border-t border-slate-200 align-top">
                      <td className="px-4 py-4 font-bold sm:px-5">{line.description}</td>
                      <td className="px-3 py-4 text-right">{line.quantity}</td>
                      <td className="px-3 py-4 text-right">{money(Number(line.unitAmount), invoice.currency)}</td>
                      <td className="px-4 py-4 text-right font-black sm:px-5">{money(Number(line.lineTotal), invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-7 grid gap-7 lg:grid-cols-[1fr_310px]">
            <div>
              {invoice.notes?.trim() ? (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-5 print:bg-white">
                  <p className="text-xs font-black uppercase tracking-wider text-blue-700">Invoice note</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{invoice.notes}</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No invoice note was recorded when this invoice was issued.</div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-5">
              <TotalRow label="Subtotal" value={money(Number(invoice.subtotal), invoice.currency)} />
              {Number(invoice.discount) > 0 && <TotalRow label="Discount" value={`− ${money(Number(invoice.discount), invoice.currency)}`} />}
              {Number(invoice.tax) > 0 && <TotalRow label="Tax" value={money(Number(invoice.tax), invoice.currency)} />}
              <TotalRow label="Invoice total" value={money(Number(invoice.total), invoice.currency)} strong />
              <TotalRow label="Amount paid" value={money(Number(invoice.amountPaid), invoice.currency)} />
              <div className="mt-3 border-t border-slate-200 pt-4">
                <TotalRow label="Outstanding" value={money(Number(invoice.outstandingBalance), invoice.currency)} strong />
              </div>
            </div>
          </section>

          <section className={`mt-7 flex items-start gap-3 rounded-2xl p-5 ${paid ? "bg-emerald-50 text-emerald-900 print:bg-white print:border print:border-emerald-200" : "bg-blue-50 text-blue-950 print:bg-white print:border print:border-blue-200"}`}>
            {paid ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <CircleDollarSign className="mt-0.5 size-5 shrink-0" />}
            <div>
              <p className="font-black">{paid ? "Payment confirmed" : `Payment due ${date(invoice.dueDate)}`}</p>
              <p className="mt-1 text-sm leading-6">
                {paid
                  ? `This invoice is fully paid${invoice.paidAt ? ` as of ${date(invoice.paidAt)}` : ""}.`
                  : "Use the secure View & Pay link in HOAHub or the billing email to complete payment. HOAHub records online payment only after verified gateway confirmation."}
              </p>
            </div>
          </section>

          <footer className="mt-10 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-bold text-slate-700">{issuer.name}</p>
                <p>{[issuer.email, issuer.website].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="sm:text-right">
                <p>Invoice {invoice.invoiceNumber}</p>
                <p>Electronically generated by HOAHub.</p>
              </div>
            </div>
          </footer>
        </div>
      </article>
    </main>
  );
}

function PartyBlock({ label, name, lines }: { label: string; name: string; lines: Array<string | null | undefined> }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <h2 className="mt-2 text-lg font-black text-pine-900">{name}</h2>
      <div className="mt-2 space-y-0.5 text-sm leading-5 text-slate-600">
        {lines.filter(Boolean).map((line, index) => <p key={`${String(line)}-${index}`} className="whitespace-pre-line">{line}</p>)}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-800">{value}</p></div>;
}

function TotalRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-start justify-between gap-4 py-1.5 ${strong ? "text-base font-black text-pine-900" : "text-sm text-slate-600"}`}><span>{label}</span><span className="text-right">{value}</span></div>;
}
