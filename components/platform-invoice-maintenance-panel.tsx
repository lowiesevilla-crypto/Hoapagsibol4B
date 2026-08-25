import { StandardTable } from "@/components/standard-table";
import { PlatformInvoiceStatus } from "@prisma/client";
import { DeleteButton, SubmitButton } from "@/components/ui";
import { deletePlatformInvoiceAction, updatePlatformInvoiceAction } from "@/lib/actions/platform-invoice-maintenance";
import { platformPrisma as prisma } from "@/lib/db";
import { inputDate } from "@/lib/utils";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

export async function PlatformInvoiceMaintenancePanel({ tenantId }: { tenantId: string }) {
  const invoices = await prisma.platformInvoice.findMany({
    where: { tenantId },
    include: { lines: { orderBy: { createdAt: "asc" } }, _count: { select: { allocations: true } } },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    take: 24,
  });
  if (!invoices.length) return null;

  const latestBySubscription = new Map<string, { id: string; period: number }>();
  for (const invoice of invoices) {
    const period = invoice.billingPeriodStart.getTime();
    const current = latestBySubscription.get(invoice.subscriptionId);
    if (!current || period > current.period) latestBySubscription.set(invoice.subscriptionId, { id: invoice.id, period });
  }

  return <details id="invoice-maintenance" open className="mt-4 scroll-mt-4 rounded-2xl border-2 border-sky-300 bg-sky-50/70 p-4 shadow-sm">
    <summary className="cursor-pointer text-base font-black text-sky-950">Platform Invoice Actions · Edit / Delete</summary>
    <p className="mt-2 text-sm font-semibold text-slate-700">Platform Admin and Super Admin can edit unpaid invoices here. Click <span className="font-black text-blue-700">Edit invoice</span> on the invoice row below.</p>
    <p className="mt-1 text-xs text-slate-500">Edit is limited to invoices without payment history. Delete is limited to the latest unpaid invoice so the subscription billing schedule can be restored safely.</p>
    <div className="mt-4 overflow-auto rounded-xl border bg-white">
      <StandardTable><table className="min-w-[1120px] w-full text-sm">
        <thead className="bg-slate-50 text-left"><tr><th className="p-3">Invoice</th><th className="p-3">Coverage</th><th className="p-3">Total</th><th className="p-3">Paid</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
        <tbody>{invoices.map((invoice) => {
          const noPaymentHistory = Number(invoice.amountPaid) === 0 && invoice._count.allocations === 0;
          const editable = noPaymentHistory && ![PlatformInvoiceStatus.PAID, PlatformInvoiceStatus.PARTIALLY_PAID, PlatformInvoiceStatus.VOID, PlatformInvoiceStatus.CANCELLED].includes(invoice.status);
          const deletable = editable && latestBySubscription.get(invoice.subscriptionId)?.id === invoice.id;
          const primaryLine = invoice.lines[0];
          return <tr key={invoice.id} className="border-t align-top">
            <td className="p-3 font-black">{invoice.invoiceNumber}</td>
            <td className="p-3">{invoice.billingPeriodStart.toLocaleDateString("en-PH")} – {invoice.billingPeriodEnd.toLocaleDateString("en-PH")}</td>
            <td className="p-3 font-bold">{money(Number(invoice.total), invoice.currency)}</td>
            <td className="p-3">{money(Number(invoice.amountPaid), invoice.currency)}</td>
            <td className="p-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black">{invoice.status.replaceAll("_", " ")}</span></td>
            <td className="p-3">
              {editable ? <div className="flex min-w-80 flex-col gap-2">
                <details>
                  <summary className="inline-flex cursor-pointer rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-800">Edit invoice</summary>
                  <form action={updatePlatformInvoiceAction} className="mt-2 grid min-w-[430px] gap-2 rounded-xl border bg-white p-3 shadow-lg sm:grid-cols-2">
                    <input type="hidden" name="tenantId" value={tenantId} />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <label><span className="label">Issue date</span><input className="field" type="date" name="issueDate" defaultValue={inputDate(invoice.issueDate)} required /></label>
                    <label><span className="label">Due date</span><input className="field" type="date" name="dueDate" defaultValue={inputDate(invoice.dueDate)} required /></label>
                    <label><span className="label">Subtotal</span><input className="field" type="number" min="0.01" step="0.01" name="subtotal" defaultValue={Number(invoice.subtotal).toFixed(2)} required /></label>
                    <label><span className="label">Discount</span><input className="field" type="number" min="0" step="0.01" name="discount" defaultValue={Number(invoice.discount).toFixed(2)} required /></label>
                    <label><span className="label">Tax</span><input className="field" type="number" min="0" step="0.01" name="tax" defaultValue={Number(invoice.tax).toFixed(2)} required /></label>
                    <label><span className="label">Line description</span><input className="field" name="lineDescription" defaultValue={primaryLine?.description || "HOAHub subscription"} required /></label>
                    <label className="sm:col-span-2"><span className="label">Invoice note</span><textarea className="field min-h-16" name="notes" defaultValue={invoice.notes || ""} /></label>
                    <p className="sm:col-span-2 text-[11px] text-slate-500">Coverage dates and invoice number remain fixed. Financial edits recalculate the invoice balance because this invoice has no payment history.</p>
                    <SubmitButton className="btn-primary sm:col-span-2">Save invoice changes</SubmitButton>
                  </form>
                </details>
                {deletable ? <form action={deletePlatformInvoiceAction}>
                  <input type="hidden" name="tenantId" value={tenantId} />
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <DeleteButton label="Delete invoice" />
                </form> : <span className="text-[11px] font-semibold text-slate-400">Delete protected · a newer billing cycle exists</span>}
              </div> : <span className="text-xs font-semibold text-slate-400">Payment/history protected</span>}
            </td>
          </tr>;
        })}</tbody>
      </table></StandardTable>
    </div>
  </details>;
}
