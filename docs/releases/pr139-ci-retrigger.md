# PR #139 typed rental report CI fix

The rental accounting hotfix uses explicit tenant-scoped SQL for `RentalPaymentAllocation` because the Rental MVP tables are migration-backed and are not Prisma model delegates.

Financial report callers supply the authenticated tenant ID. Security-deposit allocations remain cash receipts/liabilities and are excluded from recognized income by allocated amount. This commit intentionally retriggers exact-head release gates after the CI typecheck correction.
