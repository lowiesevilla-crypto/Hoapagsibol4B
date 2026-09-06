# Rental Contract & Homeowner Visibility Requirements

Status: IMPLEMENTATION IN PROGRESS — do not mark production-verified until the exact PR head and merged `main` satisfy HOAHub release governance.

## Problem statement

Rental Asset Reservations are deployed, but the homeowner mobile experience does not make the rental capability sufficiently discoverable. In addition, activating a `RentalAgreement` currently creates an operational/billing record but does not provide the renter with an official generated rental contract, PDF/Word download, printable copy, or tenant-scoped signed-contract repository.

## Functional requirements

### RENT-CONTRACT-001 — Homeowner rental visibility
When the BILLING module is enabled, a homeowner must have a visible route to `/portal/rentals` from the homeowner mobile experience. The rental screen must expose available inventory, the homeowner's own active reservation holds, and rental agreements linked to that homeowner.

### RENT-CONTRACT-002 — Agreement-to-contract creation
Creating an ACTIVE `RentalAgreement` must automatically create an immutable version-1 contract snapshot. The snapshot must include the association identity, renter identity, linked homeowner/property data when applicable, rental asset, start/end term, monthly rate, security deposit, billing day, due day, and agreement notes.

### RENT-CONTRACT-003 — Existing agreement backfill
The production-safe migration must create version-1 contract snapshots for existing rental agreements so current tenants do not lose contract functionality merely because the agreement predates this feature.

### RENT-CONTRACT-004 — Reservation fulfillment
When an ACTIVE agreement is created for the same tenant, asset, and homeowner-linked renter as an ACTIVE reservation, HOAHub must preserve the reservation row as `FULFILLED`, clear its active uniqueness key, and timestamp fulfillment. It must not delete reservation history.

### RENT-CONTRACT-005 — Generated formats
Authorized viewers must be able to retrieve the same immutable contract snapshot as:
- PDF download;
- DOCX/Word download; and
- printable HTML.

### RENT-CONTRACT-006 — Homeowner authorization
A homeowner may access a rental contract only when the agreement renter is linked to that homeowner profile in the same tenant. The contract endpoint must not accept a client-supplied homeowner identity as authorization.

### RENT-CONTRACT-007 — Admin authorization
Users with the existing rental/billing read permission may download generated or signed contract copies for agreements in their own tenant. Signed-contract upload requires the existing rental/billing manage permission.

### RENT-CONTRACT-008 — Signed contract repository
Admin may upload an executed contract in PDF or DOCX format. Uploads must be tenant-scoped and agreement-scoped, have a bounded file size, validate declared type and basic file signature, use generated stored filenames, record SHA-256, and create an audit entry. Replacing a signed copy must not silently change the generated immutable snapshot.

### RENT-CONTRACT-009 — Signed copy visibility
When an executed copy exists, both authorized Admin and the linked homeowner must be able to download it through an authenticated route. The route must prevent path traversal and send `private, no-store` responses.

### RENT-CONTRACT-010 — Tenant isolation
Every database read/write for agreement documents, reservation fulfillment, homeowner agreement visibility, signed metadata and audit data must include the tenant boundary. Contract identifiers must be unique inside the tenant scope.

### RENT-CONTRACT-011 — Record protection
Once a contract snapshot exists, HOAHub must preserve it as historical evidence. Operational edits to future billing terms must not rewrite the original generated snapshot or previously issued/signed copy.

### RENT-CONTRACT-012 — Release governance
This capability may be merged only when all required CI/browser gates pass on the exact PR head. Any failed gate must be inspected to the failing job/step, corrected at root cause, and rerun on a new head. After merge, the merged `main` SHA requires HOAHub MySQL CI plus managed-production/public-health verification before being marked production-verified.

## Acceptance checklist

- Homeowner mobile `More` screen visibly links to **Rentals & Contracts** when BILLING is enabled.
- `/portal/rentals` lists only agreements whose renter is linked to the current homeowner and tenant.
- Homeowner can download generated PDF and Word copies and open printable HTML.
- Admin agreement detail exposes PDF, Word, Print and signed-copy controls.
- Admin can upload a signed PDF/DOCX up to 15 MB.
- Existing agreements are backfilled during migration.
- New agreements automatically receive a contract snapshot.
- Matching ACTIVE homeowner reservation becomes `FULFILLED` without deletion.
- Cross-tenant and other-homeowner contract access is denied.
- Unit/integration/build/browser gates pass on the exact release head.
- Work status register is updated only after post-merge production verification.
