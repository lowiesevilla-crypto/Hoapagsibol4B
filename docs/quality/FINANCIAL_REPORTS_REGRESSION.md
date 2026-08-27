# Financial Reports date, totals, export, and tenant-isolation regression

Tracking: #205, #193, #192

This P0 regression verifies authenticated tenant-scoped Financial Reports behavior across the selected From/To range. It covers inclusive boundary dates, exact in-range amounts, exclusion of out-of-range rows, exclusion of cross-tenant finance rows, and CSV export using the same selected date range.

The production hardening is deliberately bounded: existing report queries are constrained by the authenticated tenant, and CSV export now applies the selected report range. No posting, payment, settlement, receipt, refund, payroll, billing, finance formula, schema, RBAC, or tenant business rule is changed.

The browser fixture is restricted to CI/disposable databases and is cleaned after execution.

Release gate: merge only when HOAHub MySQL CI and HOAHub Canva Visual Parity both pass on the exact PR head SHA, then verify post-merge `main` health before advancing authenticated post-deploy UAT smoke.
