# Document Platform Database Foundation

Milestone 1 establishes additive database support for the approved HOAHub Document Platform. It does not add runtime policy evaluation, workflow execution, certified-template seeding, APIs, admin UI, AI, or deployment behavior.

## Discovery and Gap Analysis

| Area | Finding | Classification |
| --- | --- | --- |
| Document registry | `DocumentDefinition` is authoritative; legacy `DocumentTypeConfiguration` and `DocumentType` remain for compatibility. | EXISTING - sufficient and reusable / LEGACY |
| Template ownership | `DocumentTemplateOwnership` and ownership/source metadata already exist on template sets, versions, and legacy templates. | EXISTING - sufficient and reusable |
| Template versions | `DocumentTemplateVersion` stores draft/published/retired JSON and published/created actors. | EXISTING - sufficient and reusable |
| Issued documents | `DocumentVersion` already stores request, definition/template snapshots, rendered content, document number, and verification references. | EXISTING - requires additive extension |
| Request history | `DocumentRequestHistory` already records immutable request history and actor. | EXISTING - requires additive extension |
| Policies | No reusable document policy registry or definition assignment existed. | MISSING - new models required |
| Workflows | Definition flags existed, but no versioned workflow/ordered-step foundation existed. | MISSING - new models required |
| Placeholders | Allowlisted placeholder validation exists in template services, but no centralized catalog existed. | MISSING - new model required |
| Numbering | `DocumentCounter` and `DocumentDefinitionCounter` exist for allocation. | EXISTING - requires additive configuration extension |
| Verification | `DocumentVerificationToken` exists with hashed token and status. | EXISTING - requires additive usage metadata |
| Audit | `AuditLog` and `writeAuditLog` are the existing audit path. | EXISTING - requires additive metadata extension |
| Notifications | `NotificationLog` is the existing event delivery record. | EXISTING - requires additive event values |
| Tenant/auth | `Tenant`, `User.tenantId`, composite tenant relations, and existing RBAC conventions are authoritative. | EXISTING - sufficient and reusable |
| Certified template seeding | No certified rows are seeded in this milestone. | FUTURE - intentionally deferred |

## New Foundation Models

- `DocumentPolicy`: tenant-scoped reusable policy metadata and validated parameters.
- `DocumentDefinitionPolicyAssignment`: tenant-safe ordered policy assignment.
- `DocumentWorkflowDefinition`: tenant-scoped, versioned workflow metadata.
- `DocumentWorkflowStep`: ordered workflow steps with approval mode, role/user approver, SLA and override metadata.
- `DocumentNumberingConfiguration`: tenant/definition-scoped numbering configuration and optimistic version field.
- `DocumentPlaceholderDefinition`: platform or tenant-owned placeholder catalog; platform records use nullable tenant ownership, tenant records require tenant ownership.

## Additive Extensions

- `DocumentDefinition.workflowDefinitionId` links a definition to a versioned workflow.
- `DocumentVersion` now supports issued/released/revoked status, release/revocation metadata, content hash, and reissue lineage.
- `DocumentRequestHistory` now supports workflow version/step, decision, acting role, decision timestamp, and override metadata.
- `DocumentVerificationToken` now supports verification count and last verification timestamp.
- `AuditLog` now supports reason, correlation ID, IP address, user agent, and future AI-action marking.
- `NotificationType` now includes document submitted, approval required, ready, released, and revoked events.

## Safety Decisions

- Existing enum fields and legacy routes remain unchanged.
- Existing template ownership remains the authority; certified ownership continues using the approved platform-owned scope.
- No existing request, version, generated content, document number, counter, audit, or verification row was rewritten.
- Historical relations use `RESTRICT` where deleting a definition, template, workflow, policy, or version could compromise history.
- Cascades are limited to configuration children/assignments where no issued history is stored.
- No runtime code consumes the new policy/workflow/numbering models yet.

## Index Rationale

Tenant/code indexes support catalog lookup and tenant-local uniqueness. Tenant/status and tenant/definition indexes support requestability, policy assignment, workflow lookup, and numbering lookup. Workflow step order indexes support ordered retrieval. Issued status, document number, reissue, decision, and audit timestamps support history and operational pagination. Verification metadata remains tenant/request/version indexed and token hashes remain unique.

## Migration Risk and Recovery

Migration `20260718170000_document_platform_database_foundation` is additive and was applied only to the local MySQL development database. The initial local attempt exposed an overlong MySQL identifier; the incomplete local DDL was recovered by removing only the newly-added, empty objects and the migration was reapplied with shortened index names. No existing data was removed or rewritten. Production deployment is intentionally deferred.

## Deferred Milestone 2 Work

- Policy evaluation and balance/membership/violation integrations.
- Workflow runtime, approval task assignment, and transitions.
- Number allocation service migration and concurrency harness.
- Placeholder resolver service and permission enforcement.
- Certified template catalog seeding and tenant clone/upgrade UI.
- Public verification route and QR rendering.
- Document notifications and delivery workers.
- Admin APIs/UI, AI, walk-in issuance, payment integration, release acknowledgement, and deployment.
