import { readFile } from "node:fs/promises";
import path from "node:path";
import { Permission } from "@/lib/authorization/permissions";
import { requireUser } from "@/lib/auth";
import { getRentalAgreementContractForViewer } from "@/lib/services/rental-agreement-contracts";
import { locateTenantUpload } from "@/lib/storage";

export const runtime = "nodejs";

function safeDownloadName(value: string) {
  return path.basename(value).replace(/["\r\n]/g, "_").slice(0, 180) || "signed-rental-agreement.pdf";
}

function responseArrayBuffer(bytes: Uint8Array) {
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return body.buffer;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const contract = await getRentalAgreementContractForViewer({
    tenantId: user.tenantId,
    agreementId: id,
    homeownerId: user.homeownerProfile?.id,
    canReadAllRentalAgreements: user.permissions.includes(Permission.BILLING_READ),
  });
  if (!contract?.signedStoredName || !contract.signedContentType) {
    return Response.json({ error: "Signed rental agreement not found." }, { status: 404 });
  }
  const storedName = path.basename(contract.signedStoredName);
  if (storedName !== contract.signedStoredName) return Response.json({ error: "Signed rental agreement path is invalid." }, { status: 400 });
  try {
    const filePath = await locateTenantUpload(user.tenant.slug, "rentals", id, "signed", storedName);
    const fileBytes = await readFile(filePath);
    const originalName = safeDownloadName(contract.signedOriginalName || `signed-${contract.contractNumber}`);
    return new Response(responseArrayBuffer(fileBytes), {
      headers: {
        "Content-Type": contract.signedContentType,
        "Content-Disposition": `attachment; filename="${originalName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Signed rental agreement file is unavailable." }, { status: 404 });
  }
}
