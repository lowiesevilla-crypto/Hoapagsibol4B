import { Permission } from "@/lib/authorization/permissions";
import { requireUser } from "@/lib/auth";
import {
  getRentalAgreementContractForViewer,
  renderRentalAgreementContractDocx,
  renderRentalAgreementContractHtml,
  renderRentalAgreementContractPdf,
} from "@/lib/services/rental-agreement-contracts";

export const runtime = "nodejs";

function safeFileStem(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120) || "rental-agreement";
}

function responseArrayBuffer(bytes: Uint8Array) {
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return body.buffer;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format")?.toLowerCase() || "pdf";
  const contract = await getRentalAgreementContractForViewer({
    tenantId: user.tenantId,
    agreementId: id,
    homeownerId: user.homeownerProfile?.id,
    canReadAllRentalAgreements: user.permissions.includes(Permission.BILLING_READ),
  });
  if (!contract) return Response.json({ error: "Rental agreement contract not found." }, { status: 404 });
  const stem = safeFileStem(contract.contractNumber);

  if (format === "html" || format === "print") {
    return new Response(renderRentalAgreementContractHtml(contract), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
  if (format === "docx" || format === "word") {
    const bytes = new Uint8Array(await renderRentalAgreementContractDocx(contract));
    return new Response(responseArrayBuffer(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${stem}.docx"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (format !== "pdf") return Response.json({ error: "Unsupported contract format." }, { status: 400 });
  const bytes = await renderRentalAgreementContractPdf(contract);
  return new Response(responseArrayBuffer(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${stem}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
