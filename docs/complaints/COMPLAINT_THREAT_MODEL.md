# Complaint Threat Model

| Threat | Control |
| --- | --- |
| Cross-tenant complaint access | Complaint models are mapped to `TenantModule.COMPLAINTS` in `lib/db.ts`; queries are scoped by tenant context. |
| Platform role viewing resident complaint content | `requireComplaintAdmin` rejects `SUPER_ADMIN` and `PLATFORM_ADMIN` by default. |
| Anonymous identity linkage | Anonymous submission stores null submitter/homeowner fields and no confidential identity row. |
| PIN disclosure | PIN is shown once in UI state and stored only as bcrypt hash. |
| Brute force tracking attempts | Existing hashed rate-limit events are used for tracking lookups and anonymous submissions. |
| Confidential identity overexposure | Normal complaint detail/report queries exclude `ComplaintConfidentialIdentity` and mask confidential complainant message authors; restricted reveal requires a configured role, reason, confirmation, and audit. |
| Unsafe attachment upload | MIME allowlist, 10 MB limit, magic-byte checks, randomized tenant path, SHA-256 hash. |
| False malware assurance | `ComplaintMalwareScanStatus.NOT_CONFIGURED` records that no scanner is configured. |
| Sensitive cache persistence | Complaint and tracking routes use no-store headers. |
| Section heading/content separation in UAT docs | UAT plan groups each workflow with acceptance criteria. |

Residual risks:

- A real malware scanner is not wired yet.
- Dual approval and time-window policy tuning for confidential identity disclosure remain product-owner/DPO governance items beyond this MVP remediation.
- Email notification templates are deferred to avoid sending privacy-sensitive content prematurely.
