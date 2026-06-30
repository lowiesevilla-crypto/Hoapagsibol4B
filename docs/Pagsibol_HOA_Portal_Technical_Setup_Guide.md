# HOA Digital Hub Technical Setup

## Architecture

| Layer | Technology |
| --- | --- |
| Web application | Next.js 15 App Router, React 19, TypeScript |
| Styling | Tailwind CSS |
| Authentication | Email/password, bcrypt, signed HTTP-only cookie |
| Database | MySQL 8 with `utf8mb4_unicode_ci` |
| ORM and migrations | Prisma 6 |
| Process manager | PM2 in production |
| Local database | Docker Compose |
| Deployment | GitHub Actions over SSH to Hostinger VPS/Node hosting |

## Project layout

- `app/admin`: protected administrator and System Administrator modules
- `app/portal`: homeowner-only pages
- `app/api`: protected integrations, uploads, and health endpoint
- `components`: reusable UI and document preview components
- `lib/actions`: validated server mutations and authorization
- `lib/services`: billing, payroll, documents, email, and external adapters
- `prisma/schema.prisma`: complete MySQL data model
- `prisma/migrations`: version-controlled MySQL migrations
- `prisma/seed.ts`: configuration and lookup data only
- `scripts`: import/export, backup, deploy, and rollback automation
- `storage` and `public/uploads`: persistent runtime files, excluded from Git

## First local installation

```powershell
Copy-Item .env.example .env
docker compose up -d mysql
pnpm install --frozen-lockfile
pnpm exec prisma validate
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Set a strong `AUTH_SECRET`. To create the first System Administrator through the seed, set all three bootstrap variables before running it:

```env
SEED_SYSTEM_ADMIN_NAME="System Administrator"
SEED_SYSTEM_ADMIN_EMAIL="system-admin@example.com"
SEED_SYSTEM_ADMIN_PASSWORD="replace-with-a-unique-12-plus-character-password"
```

Remove the bootstrap password from the environment after the account is confirmed. Re-running the seed does not create transaction data.

## Runtime configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection URL |
| `AUTH_SECRET` | Session signing secret, minimum 32 characters |
| `APP_URL` | Public HTTPS origin |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD` | SMTP delivery |
| `MAIL_FROM_NAME`, `MAIL_FROM_ADDRESS` | Branded sender identity |
| `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` | Meta Page publishing |
| `STORAGE_ROOT` | Persistent file storage root |

The System Administrator page manages supported non-secret values and encrypted/hidden application settings. Infrastructure credentials remain environment-only.

## Local autostart

`maintain-public-portal.cmd` starts Docker Desktop when needed, starts the MySQL service, checks the Next.js login page, and repairs Tailscale Funnel every minute. `start-public-portal.ps1` performs the same startup on demand. The existing Windows scheduled task starts the watchdog after sign-in.

## Troubleshooting

1. Check containers: `docker compose ps`
2. Inspect MySQL logs: `docker compose logs --tail 100 mysql`
3. Validate migration state: `pnpm exec prisma migrate status`
4. Verify database connectivity: open `/api/health`
5. Rebuild: `pnpm db:generate; pnpm build`
6. Review local logs under `work/`; logs are not committed.

Do not run `prisma db push`, `migrate reset`, or destructive SQL against production. Use reviewed migrations and the deployment workflow.
