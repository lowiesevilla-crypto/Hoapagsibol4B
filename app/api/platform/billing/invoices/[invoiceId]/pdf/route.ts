import { NextResponse } from "next/server";
import {
  getPlatformInvoiceDocument,
  renderPlatformInvoicePdf,
  verifyPlatformInvoiceDocumentToken,
} from "@/lib/services/platform-invoice-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!verifyPlatformInvoiceDocumentToken(invoiceId, token)) {
    return NextResponse.json({ error: "Invoice document link is invalid." }, { status: 404 });
  }

  const invoice = await getPlatformInvoiceDocument(invoiceId);
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const pdf = await renderPlatformInvoicePdf(invoice);
  const safeNumber = invoice.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "-");
  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="HOAHub-Invoice-${safeNumber}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
