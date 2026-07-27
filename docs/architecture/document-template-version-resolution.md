# Document Template Version Resolution

## Root Cause

The system already had request and issued-document template-version fields, but the generation resolver treated a missing or invalid captured version as permission to fall back to the current published template. In addition, legacy print/PDF routes still contained hardcoded document layouts for residency/pass/clearance documents, which could make a correctly generated HTML document appear to use another renderer.

## Decision

`resolveEffectiveDocumentTemplate` is the authoritative server-side resolver for template-engine generation.

Resolution order:

1. A valid captured request template version is used first.
2. Captured versions must belong to the same tenant and document definition.
3. Captured versions may be `PUBLISHED` or `RETIRED`, preserving historical request intent.
4. If no captured version exists, the current published version is resolved and persisted once on the request.
5. If no valid published version exists, generation raises `DOCUMENT_TEMPLATE_VERSION_NOT_AVAILABLE`.

## Historical Behavior

Issued documents continue to use stored rendered content. Historical documents are not regenerated just because a newer template is published.

## Fallback Renderer Policy

Legacy hardcoded print/PDF renderers may remain for older records that do not have shared-renderer metadata. New template-engine documents with `rendererName === "hoahub-safe-html"` use persisted issued HTML for Print, and the PDF route no longer silently substitutes a hardcoded layout.

## QR Render Mode

Template rendering now carries an explicit preview or official render mode. Preview mode uses the deterministic preview QR payload and preview warning. Official mode is created only after the official document number and verification URL exist; QR-enabled official generation fails with `OFFICIAL_VERIFICATION_CONTEXT_MISSING` before rendering if the verification URL/token is missing.

The renderer does not infer preview status from hostname, protocol, empty values, or URL parsing. `http://localhost:3000` and `http://127.0.0.1:3000` are valid local UAT origins. Official QR labels also ignore persisted template labels that contain preview warning text, so older templates cannot stamp `PREVIEW QR` or `NOT VALID FOR VERIFICATION` onto issued documents.

## Issued Export Source

Issued View, Print, Download HTML, and Download PDF use immutable issued content from `DocumentVersion.generatedContent`. The export path does not re-render from the current published template and does not select the latest draft or published version after issuance.

`lib/services/issued-document-export.ts` is the shared export service for template-engine records. It resolves the accessible issued version through the authenticated document-access path, embeds safe tenant/public assets, creates document-only print markup, and renders PDF output from the immutable HTML snapshot.

PDF export for template-engine issued documents uses `puppeteer-core` to print the same final issued HTML through Chromium. Local Windows development uses installed Chrome/Edge or `PUPPETEER_EXECUTABLE_PATH` / `CHROME_EXECUTABLE_PATH`. Linux/production can use the bundled `@sparticuz/chromium` fallback. Generated PDFs are created on demand and are not persisted yet; repeated downloads do not create new issued records, document numbers, QR tokens, or generation attempts.

Browser PDF configuration uses print media, `printBackground: true`, `preferCSSPageSize: true`, no browser header/footer, zero extra margins, and scale `1`. The service waits for DOM load, network idle, fonts, and every image before creating the PDF. Missing assets or missing required issued document content produce structured export errors instead of a partial official PDF.

Asset resolution is tenant-aware. Tenant-scoped settings, organization, and tenant uploads must match the authenticated tenant slug unless the app is using the default legacy tenant. Unsupported remote/file sources are rejected to prevent SSRF and local file disclosure.
