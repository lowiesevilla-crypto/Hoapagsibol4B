# Walk-In Approved Template Version UAT

## Finding

The Walk-In / Office Request policy summary could display the assigned published template version, such as Published v9, while some downstream output surfaces still appeared to use a different layout.

Impact: generated resident-service documents must be governed by the exact approved and published template version selected for the document definition. Any fallback to a draft, current reassigned version, legacy layout, or hardcoded renderer weakens auditability and document compliance.

Final blocker: a freshly issued Walk-In document could still display `PREVIEW QR` / `NOT VALID FOR VERIFICATION` wording because official rendering used the QR block label saved in the template. Older QR blocks persisted the preview warning as their label.

## Expected Behavior

- The request captures the exact published `DocumentTemplateVersion` selected for the definition.
- Preview, official generation, retry, View, Download, and Print use the captured version.
- If a newer version is published after request creation, the existing request still uses its saved version.
- If no published template exists, generation is blocked with a structured business error.
- Official generation creates the document number and verification URL before final rendering.
- Official QR output encodes the real verification URL and does not display preview wording.
- Local UAT accepts `http://localhost:3000/verify/documents/...` as an official verification URL.

## Local Verification

`scripts/verify-walk-in-approved-template-version.ts` creates a local fixture with v9 Published and v10 Draft, captures v9 on a request, publishes v10, then proves:

- the existing request still generates with v9;
- a new request captures v10;
- preview uses the captured version;
- template-engine Print uses stored issued HTML;
- the legacy PDF route does not silently render a hardcoded layout;
- official Walk-In output has no preview QR warning;
- official Walk-In output returns a localhost verification route for local UAT.

Targeted local result: `scripts/verify-walk-in-approved-template-version.ts` passed 11 checks against `127.0.0.1 / hoahub_prodclone_local`.
