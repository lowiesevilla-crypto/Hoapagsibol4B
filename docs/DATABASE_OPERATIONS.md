# Database Operations

## Migration policy

- All schema changes begin in `prisma/schema.prisma` on a feature branch.
- Create a named migration with `pnpm exec prisma migrate dev --name short_description` against a disposable development MySQL database.
- Review generated SQL and provide a documented `down.sql` for operator-assisted rollback.
- Pull requests run `prisma migrate deploy` against a clean MySQL service.
- Production runs only `prisma migrate deploy`; never `db push` or `migrate reset`.

## Seed policy

`prisma/seed.ts` is idempotent and contains only application configuration, document template records, expense categories, payroll deduction types, and an optional bootstrap System Administrator. It never generates production transactions.

## Backup policy

Every Hostinger deployment runs `scripts/backup-production.sh` before migrations. It creates:

- compressed transactional MySQL dump using `--single-transaction`
- compressed persistent storage/upload archive
- UTC timestamp directory and `latest` pointer

Default retention is 30 days. Also configure an encrypted off-server backup because backups stored only on the hosting account do not protect against account loss.

Manual backup:

```bash
APP_ROOT=/home/USER/apps/pagsibol-hoa bash scripts/backup-production.sh
```

## Restore drill

1. Put the application in maintenance mode.
2. Back up the current failed state for investigation.
3. Select the release and its matching backup timestamp.
4. Restore to a staging database first and verify counts.
5. Run rollback with the explicit dump only after approval:

```bash
APP_ROOT=/home/USER/apps/pagsibol-hoa \
  bash scripts/rollback-hostinger.sh RELEASE_SHA /path/to/database.sql.gz
```

6. Restore `uploads.tar.gz` to the shared directory if files were affected.
7. Check `/api/health`, login, billing totals, receipts, and homeowner data.

## Data integrity checks

- `pnpm exec prisma migrate status` reports up to date.
- `/api/health` returns `status: ok` and `database: mysql`.
- Model counts match the approved export after a cross-engine migration.
- Financial totals and payment/bill relationships pass application smoke tests.
- `DataMigration_dedupeKey_key` remains a unique index.
