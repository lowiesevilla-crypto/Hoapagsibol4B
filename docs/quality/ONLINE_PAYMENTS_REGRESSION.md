# Online Payments reporting and settlement regression

Tracking: #203, #193, #192

This P0 regression remains read-only with respect to payment and settlement authority. It verifies authenticated tenant-scoped Online Payments reporting, search, finance-status filtering, server pagination, exact settlement reference/amount evidence, and denial of a forged cross-tenant settlement identifier.

The browser fixture is restricted to CI/disposable databases and is cleaned after execution. No production payment, posting, receipt, refund, gateway, settlement, RBAC, payroll, finance formula, schema, or tenant business rule is changed by this regression.

Release gate: merge only when HOAHub MySQL CI and HOAHub Canva Visual Parity both pass on the exact PR head SHA, then verify post-merge `main` health before beginning Financial Reports regression.
