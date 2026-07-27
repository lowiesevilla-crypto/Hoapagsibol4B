import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { buildSelfContainedDocumentAssets, issuedDocumentHtmlFingerprint, renderIssuedDocumentFinalHtml, renderIssuedDocumentPdf, renderIssuedDocumentPrintHtml, type IssuedDocumentRenderSource } from "@/lib/services/issued-document-export";

type Check = [name: string, passed: boolean, detail: string];

async function main() {
  const checks: Check[] = [];
  const qr = await QRCode.toDataURL("http://localhost:3000/verify/documents/export-token", { width: 120, margin: 1 });
  const html = `<!doctype html><html><head><style>@page{size:A4 portrait;margin:0}.document-page{position:relative;width:210mm;height:297mm;min-height:297mm;background:#fff;overflow:hidden}.block{position:absolute}</style></head><body><main class="document-page"><div class="image-element" style="position:absolute;left:15mm;top:15mm;width:30mm;height:30mm"><img src="/pagsibol-logo.png" alt="Tenant logo"></div><figure class="qr-block" style="position:absolute;left:165mm;top:15mm;width:30mm;height:30mm"><img src="${qr}" alt="Document verification QR code"><figcaption>SCAN TO VERIFY</figcaption></figure><h1 class="block block-documentTitle" style="position:absolute;left:35mm;top:55mm;width:140mm;height:18mm;font-size:18pt;font-weight:900">Certificate of Export</h1><div class="block" style="position:absolute;left:35mm;top:82mm;width:140mm;height:48mm;font-size:11pt">Issued to Sevillañ with document number CR-2026-000008.</div></main></body></html>`;
  const embedded = await buildSelfContainedDocumentAssets(html, "pagsibol");
  add(checks, "relative tenant logo is embedded for export", embedded.html.includes('src="data:image/png;base64,'), "logo data URI");
  add(checks, "official QR remains data URI", embedded.html.includes("Document verification QR code") && embedded.html.includes("SCAN TO VERIFY"), "qr retained");
  add(checks, "exported HTML has no preview warning", !embedded.html.includes("PREVIEW QR") && !embedded.html.includes("NOT VALID FOR VERIFICATION"), "official wording only");

  const source = {
    html,
    selfContainedHtml: embedded.html,
    title: "Certificate of Export",
    filenameBase: "CR-2026-000008",
    warnings: embedded.warnings,
    version: { id: "version-export", documentNumber: "CR-2026-000008", version: 1, rendererName: "hoahub-safe-html" },
    request: { id: "request-export" },
    access: {},
  } as unknown as IssuedDocumentRenderSource;
  const print = renderIssuedDocumentPrintHtml(source);
  const finalHtml = renderIssuedDocumentFinalHtml(source);
  const fingerprint = issuedDocumentHtmlFingerprint(source);
  add(checks, "print and PDF use same final issued HTML source", createHash("sha256").update(finalHtml).digest("hex") === createHash("sha256").update(fingerprint.htmlHashInput).digest("hex"), "same final HTML hash");
  add(checks, "final source preserves document identity and template metadata", fingerprint.documentNumber === "CR-2026-000008" && fingerprint.rendererName === "hoahub-safe-html", `${fingerprint.documentNumber}/${fingerprint.rendererName}`);
  add(checks, "final source preserves QR, logo, and positioned elements", fingerprint.imageCount >= 2 && fingerprint.positionedCount >= 4 && fingerprint.hasQr && !fingerprint.hasPreviewWarning, JSON.stringify({ images: fingerprint.imageCount, positioned: fingerprint.positionedCount, qr: fingerprint.hasQr }));
  add(checks, "print route markup is document-only", print.includes("document-page") && !print.includes("<iframe") && !print.includes("DocumentPreview"), "no iframe wrapper");
  add(checks, "print CSS prevents viewport scrollbar capture", print.includes("overflow:visible!important") && print.includes("@media print") && print.includes("box-shadow:none!important"), "print CSS");

  const pdf = await renderIssuedDocumentPdf(source);
  add(checks, "PDF export returns a valid PDF signature", pdf.subarray(0, 5).toString("utf8") === "%PDF-", pdf.subarray(0, 5).toString("utf8"));
  add(checks, "PDF export is not HTML or JSON", !pdf.subarray(0, 40).toString("utf8").startsWith("<!doctype") && !pdf.subarray(0, 1).equals(Buffer.from("{")), "binary PDF");

  const pdfRoute = readFileSync("app/documents/[id]/pdf/route.ts", "utf8");
  const printRoute = readFileSync("app/documents/[id]/print/page.tsx", "utf8");
  const adminPage = readFileSync("app/admin/documents/page.tsx", "utf8");
  const downloadRoute = readFileSync("app/documents/[id]/download/route.ts", "utf8");
  add(checks, "template-engine PDF route no longer rejects all issued HTML documents", !pdfRoute.includes("PDF export is not available for template-engine documents") && pdfRoute.includes("renderIssuedDocumentPdf"), "real PDF path");
  add(checks, "print page uses document-only exact issued markup", printRoute.includes("DocumentOnlyPrint") && printRoute.includes("IssuedDocumentPrintRunner") && !printRoute.includes("Official issued document"), "print exact path");
  add(checks, "admin issued actions label PDF and HTML separately", adminPage.includes("Download PDF") && adminPage.includes("Download HTML") && adminPage.includes("/documents/${item.id}/pdf"), "clear actions");
  add(checks, "HTML download returns self-contained HTML", downloadRoute.includes("source.selfContainedHtml") && downloadRoute.includes(".html"), "self-contained HTML");

  for (const [name, passed, detail] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${detail}`);
  const failures = checks.filter(([, passed]) => !passed);
  if (failures.length) throw new Error(`${failures.length} issued-document export check(s) failed.`);
  console.log(`Issued document export verification passed (${checks.length} checks).`);
}

function add(checks: Check[], name: string, passed: boolean, detail: string) {
  checks.push([name, passed, detail]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
