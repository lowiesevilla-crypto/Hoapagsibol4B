# HOAHub Sprint 2.2 – Billing Rules Engine

## Phase

Phase 2.2A – Resolution-Based Monthly Dues Rules and Exemptions

## Objective

Implement a tenant-scoped billing rules engine that supports HOA resolution-based rate changes, manual or automatic billing generation preferences, future recurring charge types, and homeowner/property exemptions.

## Confirmed Business Rules

1. Each tenant currently uses one primary recurring charge:
   - Monthly Dues

2. The architecture must allow future recurring charge types, such as:
   - Security Fee
   - Maintenance Fee
   - Garbage Fee
   - Other recurring assessments

3. Each tenant can choose:
   - Manual billing generation
   - Automatic scheduled billing generation

4. Automatic scheduled generation is a future phase.
   This phase only stores the tenant preference and preserves the current manual generation workflow.

5. Default dues are normally tenant-wide.

6. The architecture must allow future homeowner/property-specific rate overrides.

7. Billing rates are controlled by HOA resolutions and effective periods.

8. Historical bills must never be recalculated when the rate changes.

## Example Rule History

- January 2026 to March 2026: PHP 500
- April 2026 only: PHP 400
- May 2026 onward: PHP 600

The billing engine must use the rule effective for the target billing month.

## Required Rule Fields

- Tenant
- Recurring charge type
- Amount
- Billing frequency
- Generation mode
- Billing day
- Due day
- Grace period
- Penalty type
- Penalty value
- Penalty frequency
- Effective start month/year
- Optional effective end month/year
- HOA resolution reference
- Resolution date
- Notes
- Active status
- Created by
- Created date
- Updated by
- Updated date

## Billing Frequency

- MONTHLY
- QUARTERLY
- ANNUAL

## Generation Mode

- MANUAL
- AUTOMATIC

## Penalty Type

- NONE
- FIXED
- PERCENTAGE

## Billing Exemptions

Support exemptions for a homeowner or property.

Required fields:

- Tenant
- Homeowner or property
- Start month/year
- End month/year
- Reason
- HOA resolution or approval reference
- Approved by
- Active status
- Created by
- Created date

## Core Behavior

When generating billing:

1. Resolve the authenticated tenant.
2. Resolve the billing month and year.
3. Find the active rule effective for that period.
4. Check whether the homeowner/property is exempt.
5. Apply a future rate override if one exists.
6. Prevent duplicate billing.
7. Create the bill using the resolved amount.
8. Preserve the source rule and resolution reference.
9. Record why billing was skipped when exempt.
10. Never modify historical bills when rules change.

## Duplicate Prevention

Prevent duplicate monthly dues for the same:

- Tenant
- Homeowner/property
- Recurring charge type
- Coverage month
- Coverage year

## UI Requirements

Create:

- `/admin/settings/billing-rules`
- `/admin/settings/billing-exemptions`

Billing Rules page must allow:

- View rule history
- Add a new rule
- Edit future rules
- Deactivate a rule
- See effective dates
- See HOA resolution reference
- See generation mode
- See penalty configuration

Billing Exemptions page must allow:

- Add exemption
- Search exemptions
- Filter active/inactive
- View coverage period
- View reason
- View approval reference
- Deactivate without deleting history

## Security

- Tenant isolation is mandatory.
- Resolve tenant from session.
- Do not trust tenant ID from client input.
- Only authorized HOA Admin and Finance roles may manage rules.
- Homeowners and employees must not access these settings.
- SUPER_ADMIN must use explicit tenant context.
- All mutations require server-side validation.

## Audit Requirements

Audit:

- Rule created
- Rule updated
- Rule deactivated
- Exemption created
- Exemption deactivated
- Billing skipped due to exemption
- Duplicate billing prevented

## Deferred

- Scheduled automatic execution
- Special assessments
- Multiple active recurring charge types
- Property-specific rate overrides
- AI
- Payment gateway changes
- Production deployment

## Definition of Done

- Tenant-scoped rule history
- Effective-period rate selection
- Manual/automatic preference stored
- Exemption periods supported
- Duplicate billing protection
- Existing billing still works
- Existing payments and receipts remain unchanged
- Prisma validate passes
- Prisma generate passes
- Migration runs safely
- Typecheck passes
- Build passes
- Local UAT completed