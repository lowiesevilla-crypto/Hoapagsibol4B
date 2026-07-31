# Complaint Architecture

Complaint Management is implemented as an additive tenant module. The module uses existing HOAHub primitives: `requireUser`, request-scoped tenant context, `TenantModule.COMPLAINTS`, Prisma tenant boundary enforcement, audit logs, no-store headers, and tenant-scoped upload storage.

Core flow:

1. Homeowner opens `/portal/complaints/new`.
2. `requireComplaintHomeowner` verifies homeowner role and explicit `COMPLAINTS` entitlement.
3. `submitComplaint` validates intake settings, privacy mode, category, text length, optional attachment, and module entitlement.
4. Complaint records are written under the active tenant. Named complaints store submitter/homeowner links. Confidential complaints store identity only in `ComplaintConfidentialIdentity`. Anonymous complaints store no identity links and create `ComplaintTrackingCredential`.
5. Admin users with tenant roles review `/admin/complaints`. Platform roles are rejected from complaint content by service checks, and confidential complainant authors are masked in service responses before rendering.
6. Confidential identity reveal uses a no-store POST route backed by `revealConfidentialIdentity`; configured reveal roles, reason, confirmation, tenant scope, and audit are enforced server-side.
7. Status, message, assignment, identity access request/reveal, and timeline actions write append-only operational records.

Key tables:

- `ComplaintSetting`
- `ComplaintCategory`
- `Complaint`
- `ComplaintConfidentialIdentity`
- `ComplaintTrackingCredential`
- `ComplaintAttachment`
- `ComplaintMessage`
- `ComplaintStatusHistory`
- `ComplaintTimelineEvent`
- `ComplaintAssignment`
- `ComplaintIdentityAccessGrant`

Migration behavior:

- Adds complaint tables only.
- Inserts disabled `COMPLAINTS` entitlements for existing tenants that lack an explicit entitlement.
- The remediation migration adds nullable `Complaint.requestedAction` and tenant-configured `ComplaintSetting.identityRevealRoles` without changing existing complaint ownership or identity records.
- Rollback is documented in the migration comment and should drop complaint tables in reverse dependency order.
