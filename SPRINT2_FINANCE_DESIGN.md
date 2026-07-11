# Sprint 2 Finance Design

## Billing Generation Engine

Sprint 2.3 uses the Billing Rules and Dues Exemptions models from Sprint 2.2 as the policy source for monthly dues generation. The engine is tenant-scoped and lives in `lib/services/billing-rules.ts` so preview and generation share one decision path.

## Preview Behavior

Preview does not create records. It resolves the authenticated tenant, selected coverage month/year, generation scope, effective Billing Rule, active exemptions, existing duplicate bills, and current open balances. The Billing page displays summary counts and a detailed table with final actions: `CREATE`, `SKIP_EXEMPT`, `SKIP_DUPLICATE`, `SKIP_NO_RULE`, or `ERROR`.

Sprint 2.3A extends the preview summary to show the effective Billing Rule, Resolution Reference, effective period, rule amount, generation mode, penalty configuration, and a clear "No effective Billing Rule configured" state. Preview detail rows carry the same Resolution Reference used when generated bills are persisted.

## Generation Scopes

Supported scopes are all eligible homeowners, individual homeowner, selected homeowners, block, and phase. Block and phase options are shown only when active homeowner data contains values for those fields. Homeowner selection is searchable by name, block, lot, and record ID.

Individual billing uses this same shared preview/generation service. The legacy create-individual-bill path now delegates new bill creation to the service so Billing Rule linkage, duplicate prevention, exemption checks, coverage fields, and Resolution Reference storage stay consistent.

## Duplicate Handling

Duplicate detection uses tenant, homeowner, recurring charge type, coverage year, and coverage month. Existing matching bills are skipped, including archived historical bills, so rerunning generation for the same period is idempotent and does not recreate historical records.

## Exemption Handling

Active Dues Exemptions are evaluated by period using start/end year and month. A homeowner covered by an exemption is skipped and the reason/resolution is shown in preview and recorded in audit logs during generation.

## Bill Creation

Eligible bills store the normalized billing month, recurring charge type, coverage year/month, Billing Rule ID, Billing Rule snapshot, resolution reference, rule amount, total amount, balance, due date derived from the rule due day, and generated notes. Existing payment and receipt behavior remains unchanged.

Balances are represented by current Bill rows and recalculated from active payments when payments change. Generation creates open Bill balances once, duplicate and exempt skips do not change balances, and Billing/Payments views are revalidated after generation so newly billed homeowners appear in Record Payment immediately.

## Payment Search and Navigation

Record Payment searches authenticated-tenant open balances. Search tokens include homeowner name, block, lot, email, account/homeowner ID, bill ID, Resolution Reference, and billing month. Payment request, active payment, and archive queries are tenant-scoped and preserve the existing recording, approval, receipt, update, and void flows.

The Payments page keeps the existing route but now exposes sub-navigation for Record Payment, Payment Requests, Active Payments, and Transaction History.

## Audit Behavior

Generation writes a summary `GENERATE_MONTHLY_DUES` audit log with tenant, actor, coverage period, scope, rule, resolution reference, counts, total amount, and timestamp. Exemption skips, duplicate skips, and row failures write focused audit entries for traceability.

## Deferred Scheduling

Automatic scheduled generation is not enabled in Sprint 2.3. The cron endpoint remains deferred and records that automatic execution is intentionally postponed.
