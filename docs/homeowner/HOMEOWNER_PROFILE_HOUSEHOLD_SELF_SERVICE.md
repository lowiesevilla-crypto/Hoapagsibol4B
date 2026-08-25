# Homeowner Profile and Household Self-Service

Status: implementation candidate on `feature/homeowner-self-profile-household`.

## Scope

The authenticated homeowner profile at `/portal/profile` supports self-service maintenance of the homeowner's own contact, personal, and property details. The action resolves the homeowner and tenant from the authenticated server session and never accepts a client-selected homeowner or tenant as authority.

The following account-controlled fields are read-only in the homeowner UI and explicitly rejected by the self-service server action if submitted in a crafted request:

- Account Number
- Monthly Dues
- Homeowner/account status and activation fields
- Tenant/homeowner/user ownership identifiers

Homeowners can add household members from `/portal/profile`. New members are linked only to the authenticated homeowner and tenant, are active immediately, and do not require HOA Admin approval before they are available to authorized household/document workflows. HOA validation/revocation controls remain available as governance controls but are not an approval gate for active homeowner-owned household members.

## Audit

Self-service profile changes create `HOMEOWNER_SELF_PROFILE_UPDATED` audit events. Household additions create `HOMEOWNER_HOUSEHOLD_MEMBER_ADDED` audit events with tenant, actor, homeowner relationship, source, and no-approval/active-immediately metadata.

## Acceptance Coverage

- Homeowner can update only their own profile.
- Account Number and Monthly Dues cannot be changed through the homeowner server action.
- Homeowner can add a household member with no admin approval step.
- Household member ownership remains tenant- and homeowner-scoped.
- Revoked, inactive, wrong-tenant, or wrong-homeowner members remain ineligible.
- Unit coverage: `tests/unit/homeowner-profile-self-service.test.ts`.
