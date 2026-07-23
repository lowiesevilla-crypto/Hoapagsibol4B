# HOAHub Document Domain Dictionary

| Term | Meaning |
| --- | --- |
| Document Definition | Tenant-owned registry record describing a requestable document and its policies. |
| Document Template Set | A tenant or certified family of template versions for one definition. |
| Template Version | Immutable published or editable draft content within a template set. |
| Document Request | A homeowner, household-member, or office-originated request. |
| Document Version | Immutable generated/issued output and its data/template snapshots. |
| Document Policy | Reusable tenant-scoped rule assignment; evaluation is explicit and auditable. |
| Workflow Definition | Versioned ordered steps used to derive approval progression. |
| Workflow Step | One review or approval responsibility in a workflow definition. |
| Approval History | Immutable request history entries recording workflow decisions. |
| Placeholder | An allowlisted data binding such as `{{subject.fullName}}`. |
| Definition Counter | Tenant-and-definition scoped atomic sequence for new numbers. |
| Verification Token | Random public token represented at rest by a hash. |
| Runtime Context | Authenticated tenant, user, role, permissions, and correlation boundary. |
| Certified Template | Platform-owned read-only template source that may be cloned by a tenant. |
| Tenant Template | Tenant-owned editable template set and versions. |
| Published | A version approved for assignment and generation; its content is immutable. |
| Requestable | A definition that passes completeness, ownership, workflow, template, and visibility checks. |
| Legacy Compatibility | Existing enum, template body, numbering, and verification paths retained until a planned migration. |

## Status vocabulary

`DRAFT`, `ACTIVE`, `INACTIVE`, and `ARCHIVED` describe definitions. `DRAFT`,
`PUBLISHED`, and `RETIRED` describe template versions. `VALID` and `REVOKED`
describe stored verification tokens; an expired token is reported as expired
at verification time without mutating historical issuance data.
