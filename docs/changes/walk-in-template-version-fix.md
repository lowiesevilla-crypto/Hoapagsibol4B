# Walk-In Template Version Fix

## Summary

Walk-In and Homeowner document requests now resolve the approved published template server-side and persist the exact template version snapshot. The generation resolver preserves captured versions and blocks invalid/missing templates instead of silently falling back.

The final UAT QR blocker was also corrected: official generation now builds an explicit official render mode with a real verification URL before rendering, and the QR renderer no longer displays saved preview-warning labels on issued documents.

## Files Changed

- `lib/services/document-template-runtime.ts`
- `lib/services/document-generation.ts`
- `lib/services/document-workflow-executor.ts`
- `lib/actions/documents.ts`
- `app/admin/documents/new/page.tsx`
- `components/manual-document-form.tsx`
- `app/documents/[id]/page.tsx`
- `app/documents/[id]/print/page.tsx`
- `app/documents/[id]/pdf/route.ts`
- `lib/services/document-render-model.ts`
- `lib/services/document-renderers.ts`
- `lib/services/document-runtime-errors.ts`
- `scripts/verify-walk-in-approved-template-version.ts`
- `scripts/verify-designer-uat-blockers.ts`

## Schema

No new schema migration was required. Existing fields are used:

- `DocumentRequest.templateVersionIdSnapshot`
- `DocumentRequest.templateVersionSnapshot`
- `DocumentRequest.templateDefinitionSnapshot`
- `DocumentVersion.templateVersionId`
- `DocumentVersion.templateVersion`
- `DocumentVersion.templateDefinitionSnapshot`

## Rollback

Revert the code changes and remove the verification script/docs. No production data or destructive migration is involved.

## Known Limitation

Exact PDF rendering for arbitrary HTML templates is not implemented. To prevent governance drift, the legacy PDF route is blocked for shared-template documents instead of silently rendering a hardcoded layout.

## Verification

- `scripts/verify-designer-uat-blockers.ts`: preview QR still shows preview warning; official localhost QR has no preview warning; missing official verification context raises `OFFICIAL_VERIFICATION_CONTEXT_MISSING`.
- `scripts/verify-document-workflow-executor.ts`: fresh Free + Instant official generation issues a real verification URL, creates one token/version, omits preview QR wording, and preserves retry idempotency.
- `scripts/verify-walk-in-approved-template-version.ts`: captured template versions and official Walk-In QR output pass together.
- `scripts/verify-issued-document-export.ts`: template-engine PDF export returns a valid PDF binary, print markup is document-only, and HTML assets are embedded.
