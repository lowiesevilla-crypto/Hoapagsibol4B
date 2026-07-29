# Complaint Privacy And Anonymity

Privacy modes:

- `NAMED`: `Complaint.submittedById` and `Complaint.homeownerId` may be stored.
- `CONFIDENTIAL`: general complaint records omit identity. Identity is stored in `ComplaintConfidentialIdentity` and is excluded from normal list/detail includes.
- `ANONYMOUS`: `Complaint.submittedById`, `Complaint.homeownerId`, and `ComplaintConfidentialIdentity` remain null. Tracking uses `ComplaintTrackingCredential`.

Anonymous tracking:

- Tracking code is random.
- PIN is generated separately and stored only as a salted bcrypt hash.
- Public tracking requires both tracking code and PIN.
- Tracking results expose public case status and public messages only.

Confidential identity:

- Admin case views state that identity is restricted.
- Access requests are recorded in `ComplaintIdentityAccessGrant` with purpose and reason.
- Direct identity disclosure is intentionally not implemented in MVP to avoid accidental exposure before policy approval.

Attachment privacy:

- Files are stored under tenant-scoped randomized paths.
- File name, type, size, hash, visibility, and scanner status are stored.
- Download routes require authenticated tenant access and complaint ownership/staff permission.

Caching:

- Complaint routes and APIs use no-store headers.
- Attachment responses use private no-store headers.
