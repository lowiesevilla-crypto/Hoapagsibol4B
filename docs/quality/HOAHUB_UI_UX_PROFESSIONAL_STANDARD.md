# HOAHub Professional UI/UX Standard

Status: ACTIVE DESIGN / IMPLEMENTATION STANDARD
Baseline: post-rollback `main` at `34e62289d35163e17ea835a76cf63b3c509e3eaa`
Last updated: 2026-08-26

## Objective

Create a clean, credible, modern HOA administration and homeowner experience while preserving the existing business rules used by active tenants.

This standard governs how future UI work is designed and reviewed. It does not authorize changing domain logic, tenant scoping, permissions, finance rules, or workflow authority.

## Experience Principles

### 1. Make the next action obvious

Every page should answer:

- Where am I?
- What am I looking at?
- What can I do here?
- What happened after my last action?
- What do I need to do next?

### 2. Prefer clarity over visual decoration

Use strong information hierarchy, restrained color, consistent spacing, readable typography, and meaningful status labels. Avoid unnecessary dashboard decoration, excessive gradients, dense card walls, or icons without labels on business-critical actions.

### 3. Preserve user confidence

Finance, documents, approvals, and status pages must clearly distinguish confirmed facts from pending states.

Examples:

- `Payment successful` is not the same as `Settlement deposited`.
- `Draft` is not the same as `Issued`.
- `Submitted` is not the same as `Approved`.
- `Saved` is not the same as `Posted` when the domain distinguishes them.

### 4. Mobile is a first-class experience

Homeowners should be able to complete common tasks with one hand on a modern phone. Admin mobile/tablet views should remain operational without hiding essential actions behind unusable horizontal tables.

### 5. Keep common tasks short

Target common operational tasks at three primary interactions or fewer after the relevant record is found, where business controls allow it.

## Page Composition Standard

Recommended page order:

1. Breadcrumb or clear module context.
2. Page title.
3. One-sentence purpose/description where useful.
4. Primary action in a consistent location.
5. KPI/summary cards only when they help decision-making.
6. Search/filter controls.
7. Main content.
8. Result count and pagination.
9. Secondary help/audit/detail information.

Do not bury the primary task below decorative content.

## Navigation Standard

- Group modules by user task, not database model.
- Keep labels stable across pages and navigation.
- Use the same term for the same concept everywhere.
- Active navigation state must be obvious.
- High-frequency tasks should not require users to remember hidden routes.
- Direct URLs remain authorization checked; navigation visibility is only presentation.

## Search Standard

Every large data workspace that exposes search must provide working behavior, not a decorative input.

### Required behavior

- Search button or explicit, predictable submit behavior.
- Clear/Reset action.
- Visible active filters.
- Result count.
- Loading state.
- No-results state that explains what was searched.
- Pagination preservation or intentional reset documented per workflow.
- Current selected record preserved when required by edit workflows.
- Server-side search for large directories.

### Domain examples

Homeowners:

- name;
- account number;
- block/lot;
- address;
- other approved identifiers.

Payments:

- homeowner;
- HOAHub reference;
- payment/gateway reference;
- request ID;
- date;
- status/channel when authoritative.

Documents:

- homeowner;
- document type;
- request/reference number;
- status;
- date.

### Prohibited pattern

Loading only an arbitrary first 100/500/5,000 records into a selector and presenting it as complete search is not acceptable for a system designed for large tenants.

## Table and Data Workspace Standard

The previous broad StandardTable rollout demonstrated that shared table behavior can create production regressions. Therefore:

### Allowed shared concerns

- container appearance;
- border/spacing/typography;
- header appearance;
- badge appearance;
- empty-state visuals;
- mobile presentation helpers.

### Module-owned concerns unless explicitly migrated

- data source;
- server query;
- search semantics;
- pagination authority;
- sorting;
- filter query state;
- row mapping;
- row actions;
- form submission;
- finance calculations;
- authorization.

### Desktop

- Keep essential columns readable.
- Use sticky headers only when they do not obscure controls.
- Put primary row actions consistently.
- Avoid multiple nested pagination controls.
- Make selected/active states visible.

### Mobile

For wide operational tables, use one of:

- responsive cards;
- prioritized columns plus expandable details;
- task-focused list rows.

Do not require users to horizontally scroll through many business-critical columns just to reach the main action.

## Form Standard

### Labels

Every field has a visible label. Placeholder text is not a replacement for a label.

### Validation

Show validation next to the field and preserve entered values.

Bad:

`Something went wrong.`

Better:

`Billing Month — Please select a valid billing month.`

### Save behavior

Complex forms use an explicit action such as:

`Save changes`

Search/select controls must not accidentally submit the entire form when Enter is used to select a result.

### Submission protection

When submitting:

- disable/restrict duplicate submission;
- show `Saving…`, `Posting…`, or the accurate action state;
- return a clear success/failure message;
- keep error recovery local where possible.

### Dirty-state warning

For complex edits, warn before leaving when unsaved changes exist.

### Disabled actions

If a user can see but cannot use an action, explain why where useful.

Example:

`Cannot record payment — homeowner account is inactive.`

## Financial UI Standard

Always separate financially different concepts.

Display as applicable:

- principal;
- penalty;
- discount;
- HOAHub convenience fee;
- gateway processing fee;
- customer-paid total;
- allocated amount;
- unapplied credit;
- refund;
- outstanding balance.

Do not derive or label a payment rail more specifically than the authoritative evidence supports.

### Online payment lifecycle

Use explicit state semantics such as:

`Initiated → Paid/Confirmed → Clearing → Available → Payout → Deposited`

only where those states are supported by gateway evidence. Never imply a deposited settlement from browser redirect success alone.

## Documents and Approval UX

Clearly distinguish:

- Draft;
- Pending approval;
- Approved;
- Published/Issued;
- Rejected;
- Expired;
- Revoked;
- Archived/Retired.

For requests with fees, show the payment requirement, payment state, release condition, and next action without requiring the user to infer workflow logic.

## Status and Feedback Standard

Every state-changing action needs immediate feedback.

### Success

- concise;
- specific;
- confirms the object affected;
- includes the next action when useful.

Example:

`Payment recorded. Official receipt AR-MD-2099-0001234 is ready.`

### Error

- state what failed;
- preserve user work;
- explain recovery when safe;
- do not expose technical secrets.

### Empty state

Explain whether:

- there is no data yet;
- filters returned no results;
- the user lacks access;
- the module is not enabled.

These are not the same state.

## Copy and Language Standard

- Use concise professional English by default.
- Be Filipino-ready and preserve official/legal Philippine terminology where required.
- Avoid developer jargon in end-user messages.
- Prefer verbs for actions: `Record payment`, `Issue document`, `Approve request`.
- Prefer explicit nouns for sections: `Payment History`, `Document Requests`.
- Avoid ambiguous labels such as `Process`, `Do`, or `Submit` when a more specific action exists.

## Accessibility Standard

Critical flows target WCAG 2.1 AA.

Minimum review:

- keyboard navigation;
- visible focus;
- semantic labels;
- form error association;
- headings in logical order;
- modal focus trap and return;
- readable contrast;
- status not conveyed only by color;
- touch targets practical for mobile;
- reduced motion where appropriate;
- no critical action reachable only by hover.

## Responsive Breakpoints and Behavior

The implementation may use the existing Tailwind breakpoints, but behavior is more important than exact pixel values.

Review at minimum:

- narrow mobile around 360–390px;
- large mobile around 430px;
- tablet around 768–1024px;
- desktop around 1280–1440px;
- wide desktop where used by finance/reporting users.

No essential action may disappear simply because the viewport is smaller.

## Loading Performance UX

- Show immediate loading feedback for actions expected to take noticeable time.
- Avoid full-page blocking for small local operations.
- Use skeletons only where they improve perceived continuity.
- Preserve filter/search context through loading.
- Do not display stale totals as if current while refresh is pending.

## Destructive Action Standard

For Delete, Void, Refund, Revoke, Archive, Close, or other material operations:

- use explicit action wording;
- show the affected object/reference;
- show irreversible consequences where applicable;
- require confirmation appropriate to the risk;
- preserve audit history.

## UI Change Acceptance Checklist

Before a UI PR is ready:

- [ ] Existing business rules are unchanged unless explicitly in scope.
- [ ] Tenant/RBAC behavior is unchanged or explicitly tested.
- [ ] Search is functional if shown.
- [ ] Pagination has one clear authority.
- [ ] Loading state is usable.
- [ ] Empty/no-match states are distinct.
- [ ] Error state preserves recoverable input.
- [ ] Save/submit cannot be accidentally duplicated.
- [ ] Enter-key behavior is tested on searchable form controls.
- [ ] Desktop reviewed.
- [ ] Mobile reviewed.
- [ ] Keyboard/focus reviewed for critical flow.
- [ ] Visual regression artifact captured for materially changed route.
- [ ] Affected browser E2E passes.
- [ ] No unrelated mass refactor included.

## Rollout Rule

A shared UI pattern becomes eligible for wider adoption only after it succeeds in at least two materially different real workflows and has automated coverage for its behavior. Visual similarity alone is not sufficient evidence.
