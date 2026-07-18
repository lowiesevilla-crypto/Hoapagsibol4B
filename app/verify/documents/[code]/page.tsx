import type { Metadata } from "next";
import { rateLimitAvailable, recordRateLimitFailure } from "@/lib/rate-limit";
import { verifyDocumentToken, verifyLegacyDocumentCode } from "@/lib/services/document-verification";
import { shortDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Document Verification",
  robots: { index: false, follow: false, nocache: true },
};

export default async function VerifyDocumentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const allowed = await rateLimitAvailable("document-verification", code, 30, 60_000);
  if (!allowed) return <VerificationShell result={{ status: "INVALID", tenantName: null, documentNumber: null, documentType: null, issueDate: null, validUntil: null }} rateLimited />;
  await recordRateLimitFailure("document-verification", code);
  const result = code.length >= 32 ? await verifyDocumentToken(code) : await verifyLegacyDocumentCode(code);
  return <VerificationShell result={result} />;
}

function VerificationShell({ result, rateLimited = false }: { result: Awaited<ReturnType<typeof verifyDocumentToken>>; rateLimited?: boolean }) {
  const valid = result.status === "VALID";
  const label = rateLimited ? "TRY AGAIN LATER" : result.status === "INVALID" ? "INVALID OR UNKNOWN" : result.status;
  return <main className="grid min-h-screen place-items-center bg-pine-900 p-4"><section className="w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl sm:p-9">
    <p className="text-xs font-black uppercase text-pine-700">HOAHub document verification</p>
    <h1 className="mt-2 text-2xl font-black">{result.documentType || "Official HOA Document"}</h1>
    <div className={`mt-6 rounded-lg border p-5 ${valid ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}><p className="font-black">{label}</p><p className="mt-1 text-sm">{valid ? "This verification token matches an issued HOA document." : "This verification result cannot confirm a currently valid document."}</p></div>
    {result.status !== "INVALID" && <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2"><Item label="Document number" value={result.documentNumber || "Not available"} /><Item label="Status" value={result.status} /><Item label="Issue date" value={result.issueDate ? shortDate(result.issueDate) : "Not available"} /><Item label="Issuing association" value={result.tenantName || "Not available"} />{result.validUntil && <Item label="Valid until" value={shortDate(result.validUntil)} />}</dl>}
    <p className="mt-6 text-xs text-slate-500">This public result intentionally excludes resident, property, payment, approval, and internal system information.</p>
  </section></main>;
}

function Item({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 font-bold text-ink">{value}</dd></div>;
}
