# Issued Document PDF, Print, and Asset Export UAT

## Findings

- Template-engine PDF export intentionally returned a JSON 409 instead of a PDF.
- The print path rendered the immutable issued HTML inside an iframe wrapped by the application preview shell, so browser print could capture scrollbars or clip the page.
- The document detail action labeled the immutable HTML download as the primary download, which made it easy to treat HTML as the PDF export.
- Downloaded HTML kept relative assets such as `/pagsibol-logo.png`, so standalone files could show broken logos.
- Final blocker: Print Preview was complete, but Download PDF was incomplete because the PDF path used a separate `pdf-lib` approximation instead of browser-printing the final issued HTML.

## Root Causes

- `app/documents/[id]/pdf/route.ts` explicitly rejected `rendererName === "hoahub-safe-html"`.
- `app/documents/[id]/print/page.tsx` used `DocumentPreview` plus an iframe for exact template-engine output.
- `app/documents/[id]/download/route.ts` returned raw stored HTML without embedding local tenant/public image assets.
- Admin issued actions exposed a generic `PDF` link without separate View, Print, Download PDF, and Download HTML labels.
- `renderIssuedDocumentPdf` attempted to manually draw selected text/images with `pdf-lib`; that renderer did not support the template browser layout, absolute positioning, full CSS, print media, or all sections.

## Export Architecture

`lib/services/issued-document-export.ts` centralizes issued export behavior:

- resolves the latest immutable `DocumentVersion.generatedContent`;
- preserves the captured issued template/version content;
- embeds safe local/public/tenant assets into exported HTML;
- rejects remote, file, UNC, and cross-tenant asset sources;
- builds document-only print markup;
- renders a real `application/pdf` binary by loading the same final issued HTML into Chromium and using browser print-to-PDF.

PDF generation uses `puppeteer-core` with local Chrome on Windows and `@sparticuz/chromium` as the Linux/production Chromium fallback. This adds a browser renderer so absolute positioning, CSS variables, millimeter page sizing, print media CSS, data URI images, QR images, borders, colors, and backgrounds follow the same path as Print Preview.

## Print Strategy

Template-engine print now renders the issued document content directly on a document-only page. It does not use an iframe, modal, card, toolbar, or preview shell. A small client runner waits for fonts and images before calling `window.print()`.

Download PDF uses the same final HTML and equivalent print CSS. The browser PDF sequence sets print media, waits for load/network idle, waits for fonts, waits for all images, validates the document page and document number, then generates PDF with print backgrounds, preferred CSS page size, and zero additional margins.

## Asset Strategy

HTML export and print embed supported local assets as data URIs. Supported sources include approved public assets and tenant-scoped upload paths. Missing assets are replaced with a transparent placeholder and recorded as export warnings instead of leaving broken-image icons.

## Local Verification

Executed locally against `127.0.0.1 / hoahub_prodclone_local` where database access was required.

- `scripts/verify-issued-document-export.ts`: passed 11 checks.
- Final browser-PDF verifier result: `scripts/verify-issued-document-export.ts` passed 14 checks after switching to Chromium print-to-PDF.
- Existing workflow/template/QR verification should continue to pass as part of the release gate.

## UAT Result

Automated local export checks pass. Browser UAT was not marked passed unless the full side-by-side browser/PDF-reader sequence is executed manually for `CR-2026-000008` and one fresh issued request.

## Rollback

Revert:

- `lib/services/issued-document-export.ts`
- `components/issued-document-print-runner.tsx`
- route/action changes under `app/documents/[id]` and `app/admin/documents/page.tsx`
- this verification script and documentation

No schema migration or production data change is involved.
