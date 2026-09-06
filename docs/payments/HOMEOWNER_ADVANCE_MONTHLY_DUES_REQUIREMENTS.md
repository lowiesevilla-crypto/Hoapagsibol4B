# Homeowner Advance Monthly Dues — Requirements & Release Safety

Status: implementation in progress for GitHub issue #146 item 4.

## Objective

Allow an authenticated homeowner to pay eligible future Monthly Dues online through the existing tenant PayMongo flow even when there is no current open Monthly Dues bill. The homeowner chooses a coverage **From month** and **To month**; HOAHub calculates the authoritative amount from the tenant's effective Monthly Dues billing rules and records verified payment as unapplied homeowner credit. Existing automatic credit reconciliation then applies that credit oldest-first to future Monthly Dues bills.

## Functional requirements

### ADV-DUES-001 — Homeowner-selected future coverage

- The homeowner can choose From/To month from `/portal/pay` using **Advance Monthly Dues**.
- The range is inclusive and ordered.
- Coverage cannot start before the current month in Asia/Manila.
- One checkout is bounded to a maximum of 24 months.
- A coverage month that already has a Monthly Dues billing record is not eligible for advance payment; the homeowner must pay that billing record instead.

### ADV-DUES-002 — Authoritative server-side pricing

- The browser never supplies an authoritative advance amount.
- An authenticated tenant/homeowner-scoped quote endpoint calculates each month using active effective Monthly Dues rules.
- Rule changes across the selected range are calculated month-by-month.
- Active Monthly Dues exemptions are honored; exempt months contribute PHP 0 and are shown to the homeowner.
- If any non-exempt selected month has no effective Monthly Dues rule, checkout is blocked.
- A fully exempt range cannot create a zero-value checkout.
- The checkout action recalculates the quote server-side before creating the payment request; the client quote is display/UX evidence only.

### ADV-DUES-003 — Existing PayMongo controls remain authoritative

- The feature uses the existing tenant PayMongo linked-account configuration, checkout service, verified webhook signature, platform/convenience-fee behavior, gateway reference handling, and payment-request lifecycle.
- Advance payment requests are stored as `MONTHLY_DUES` payment requests with `billId = null` and a versioned canonical coverage marker.
- A pending request for the same homeowner/range is reused only when its amount matches the current server quote; a changed rule amount cannot silently replace a live checkout.
- Manual Admin approval/rejection must not bypass a pending PayMongo request. Only verified gateway confirmation may convert the special bill-less Monthly Dues request to credit.

### ADV-DUES-004 — Verified payment becomes homeowner advance credit

- On verified PayMongo confirmation, HOAHub issues an MD-series receipt and creates one ACTIVE tenant-scoped `Payment`.
- The Payment is deliberately not linked directly to a Bill and initially has no `PaymentAllocation` rows.
- Coverage From/To, normalized coverage months and display text are persisted on the Payment for receipt/SOA/reporting visibility.
- The payment uses `payment-request:<requestId>` idempotency and existing unique gateway/reference protections.
- Audit evidence identifies the transaction as `PAYMONGO_HOMEOWNER_ADVANCE_DUES` / `MONTHLY_DUES_ADVANCE_CREDIT`.

### ADV-DUES-005 — Future allocation

- The existing `applyHomeownerAdvanceCreditToOpenBills` service remains the single allocation authority.
- Available homeowner credit is allocated oldest-billing-month first through tenant-scoped `PaymentAllocation` rows.
- The existing daily tenant maintenance sequence runs automatic billing before advance-credit reconciliation, so newly generated automatic Monthly Dues bills consume available advance credit in the same maintenance cycle.
- Daily reconciliation remains a recovery path for bills created through other authorized generation workflows.
- No parallel credit ledger or new balance table is introduced.

### ADV-DUES-006 — Multi-tenant isolation

- Quote, checkout request creation, payment approval, Payment storage and future allocation all require explicit tenant + homeowner scope.
- A homeowner from another tenant cannot be quoted or paid under the active tenant.
- Credit from one tenant cannot allocate to another tenant's Bill.

### ADV-DUES-007 — Live-tenant safety

- This change is additive and does not rewrite existing Bill, Payment, Receipt or PaymentAllocation history.
- No schema migration is required.
- Existing open-bill Monthly Dues checkout remains unchanged.
- Existing Admin advance-payment capability remains unchanged.
- Existing PayMongo webhook remains the payment source of truth.
- Existing automatic billing, 5,001-homeowner controls, receipt uniqueness, financial reporting and tenant isolation must remain green.

## UX requirements

- `Advance Monthly Dues` is a distinct homeowner payment transaction type.
- From/To inputs use month controls.
- The UI shows quote loading, safe server errors, coverage label, monthly rule/exemption lines and total.
- The total cannot be manually edited.
- The UI explains that verified payment becomes advance credit and future Monthly Dues bills consume credit automatically.
- Existing platform fee + provider Processing Fee disclosure remains visible.

## Acceptance evidence

Required before merge:

- Pure/unit coverage for range validation, 24-month bound and canonical marker round-trip.
- Static/regression evidence that the client calls the authenticated quote endpoint and the server action recalculates the authoritative quote.
- Database integration proving effective-rule changes, exemption handling, bill-less verified PayMongo approval to unapplied Payment credit, future Bill allocation and second-tenant isolation.
- Existing full HOAHub unit/integration regression suite green.
- Required exact-head PR gates green: HOAHub MySQL CI, Canva Visual Parity, Edge Critical Flow, Firefox Critical Flow and Mobile Responsive Evidence.

Required after merge:

- HOAHub MySQL CI green on the exact merged `main` SHA.
- Hostinger expected-release marker green.
- Public `/api/health` green.
- Only after those checks may issue #146 item 4 be marked production-verified and the final six-item #146 reconciliation be considered.

## Rollback

If post-release behavior is unsafe, revert the feature commit/PR. Existing Payments already confirmed by PayMongo must not be deleted or rewritten; they remain auditable financial records and can be handled through the existing authorized payment-maintenance controls. No destructive production data rollback is permitted.
