# Complaint Management BRD Traceability Matrix

Source: `HOAHub_Complaint_Management_BRD_v1.0.docx`, version 1.0, July 29, 2026.

| BRD Area | Requirement Coverage | Implementation |
| --- | --- | --- |
| CM-001 to CM-006 | Tenant-scoped complaint module, homeowner/admin routes, module entitlement gate, disabled-by-default for existing tenants. | `TenantModule.COMPLAINTS`, `lib/module-routing.ts`, `lib/tenant.ts`, `lib/db.ts`, migration disabled entitlement insert. |
| CM-007 to CM-012 | Named, confidential, and anonymous complaint intake. | `components/complaint-intake-form.tsx`, `lib/services/complaints.ts`, `/portal/complaints/new`, `/complaints/track`. |
| CM-013 to CM-018 | Status lifecycle, status history, timeline, assignment, reopen/close states. | `ComplaintStatus`, `ComplaintStatusHistory`, `ComplaintTimelineEvent`, `ComplaintAssignment`, `/admin/complaints/[id]`. |
| CM-019 to CM-024 | Attachments with tenant storage, size/type checks, signature validation, scanner status. | `ComplaintAttachment`, `stageAttachment`, `/uploads/complaints/[...path]`; scanner status recorded as `NOT_CONFIGURED`. |
| CM-025 to CM-030 | Admin triage, category settings, SLA targets, reports. | `/admin/complaints`, `/admin/complaints/settings`, `/admin/complaints/reports`, `ComplaintSetting`, `ComplaintCategory`. |
| CM-031 to CM-036 | Anonymous tracking without identity linkage. | `ComplaintTrackingCredential`, salted PIN hash, `trackAnonymousComplaint`, verification script identity-null checks. |
| CM-037 to CM-041 | Confidential identity separation and restricted disclosure workflow. | `ComplaintConfidentialIdentity`, `ComplaintIdentityAccessGrant`, detail page excludes identity values and records access requests. |
| CM-042 to CM-045 | Auditability, no unsafe exports, privacy-aware reporting, operational UAT. | `writeAuditLog`, aggregate reports only, required docs and `verify:complaint-management`. |
| SEC-CM-001 to SEC-CM-010 | Tenant isolation, RBAC, privacy modes, attachment controls, no caching. | Prisma tenant boundary mapping, complaint service role checks, no-store headers, attachment authorization route. |
| NFR-CM-001 to NFR-CM-010 | Local validation, buildability, maintainability, additive schema. | Additive migration, `pnpm run verify:complaint-management`, TypeScript/Next routes following existing patterns. |
| UAT-CM-001 to UAT-CM-024 | End-to-end UAT paths for homeowner, anonymous tracking, admin triage, reports, and access blocking. | Covered by route implementation and `COMPLAINT_UAT_PLAN.md`. |

Known MVP Limitations:

- Email notifications are not sent by this MVP until complaint notification templates are approved.
- Malware scanning is represented by workflow state only; no scanner is claimed or invoked.
- Confidential identity approval is recorded, but direct disclosure tooling is intentionally not implemented for MVP.
