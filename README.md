# HOAHub - PAGSIBOL VILLAGE PH2 4B EAST Portal

Production-oriented HOA Digital Hub built with Next.js 15, TypeScript, Tailwind CSS, Prisma, and MySQL 8. It provides role-based administration, homeowner billing and payments, receipts, collections and bonds, payroll, expenses, reports, announcements, events, chat, document generation, and mobile access.

## Requirements

- Node.js 22.13 or newer
- pnpm 10.12.1
- MySQL 8.0 or newer
- Docker Desktop for the included local MySQL service

## Local setup

1. Copy `.env.example` to `.env` and replace `AUTH_SECRET` with at least 32 random characters.
2. Start MySQL: `docker compose up -d mysql`
3. Install packages: `pnpm install --frozen-lockfile`
4. Generate Prisma Client: `pnpm db:generate`
5. Apply migrations: `pnpm db:migrate:deploy`
6. Optionally set `SEED_SYSTEM_ADMIN_EMAIL` and `SEED_SYSTEM_ADMIN_PASSWORD`, then run `pnpm db:seed`.
7. Start development: `pnpm dev`

Open [http://localhost:3000/login](http://localhost:3000/login). Production runs at [https://hoahub.tech](https://hoahub.tech). The configuration seed creates lookup and system configuration only. It does not create homeowner, billing, payment, payroll, attendance, announcement, event, or chat transactions.

## Environment

Never commit `.env`, credentials, tokens, production uploads, logs, or backups. The complete safe template is [.env.example](.env.example).

The production database URL format is:

```env
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE"
```

Keep SMTP passwords, Meta tokens, webhook secrets, and `AUTH_SECRET` in Hostinger or GitHub secret storage. System Settings may show non-secret configuration, but a server restart is required after changing runtime environment values.

## Database operations

```bash
pnpm exec prisma validate
pnpm db:migrate:deploy
pnpm db:seed
pnpm db:export -- backups/manual.json
pnpm db:import -- backups/manual.json
```

`db:import` replaces the target database contents and verifies every model count. Use it only during an approved migration or restore window after taking a fresh backup.

## Verification

```bash
pnpm typecheck
pnpm build
curl http://localhost:3000/api/health
```

The health endpoint returns HTTP 200 only when the application can query MySQL.

## Git and deployment

- `main`: protected production branch
- `develop`: integration branch
- `feature/*`, `release/*`, `hotfix/*`: short-lived work branches
- `codex/*`: Codex-authored changes prepared for review

Pull requests run MySQL migrations, configuration seed, type checking, a production build, and HTTP smoke checks. A successful push to `main` deploys an immutable release to Hostinger when the required repository secrets are configured.

Read these guides before production work:

- [HOAHub production deployment](DEPLOYMENT.md)
- [Production checklist](PRODUCTION_CHECKLIST.md)
- [MySQL migration](docs/MYSQL_MIGRATION_GUIDE.md)
- [Database operations](docs/DATABASE_OPERATIONS.md)
- [GitHub workflow](docs/GITHUB_WORKFLOW.md)
- [Hostinger deployment](docs/Pagsibol_HOA_Portal_Hostinger_Deployment_Guide.md)
- [Technical setup](docs/Pagsibol_HOA_Portal_Technical_Setup_Guide.md)
- [User manual](docs/Pagsibol_HOA_Portal_User_Manual.md)

## Local public access

The existing Windows/Tailscale setup can still publish the local production build at `https://pagsibol-hoa.tail2abf68.ts.net/login`:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-public-portal.ps1
```

The scheduled task `Pagsibol HOA Portal` runs `maintain-public-portal.cmd`, which keeps Docker MySQL, Next.js, and Tailscale Funnel available after Windows sign-in. Hostinger deployment is recommended for production uptime because local access still depends on the computer, internet connection, Docker Desktop, and Tailscale.

## Security

- Passwords use bcrypt hashes; sessions use signed HTTP-only cookies.
- Server actions and API routes recheck role and input validation.
- Homeowner data is resolved from the authenticated user, not a supplied homeowner ID.
- Payment changes and voids retain audit history and recalculate balances transactionally.
- Production migrations are forward-only and preceded by database/upload backups.
- Uploaded files and generated documents are persistent runtime data and are excluded from Git.

## Release

Current application release: `2.0.0` (MySQL and Hostinger CI/CD baseline). See [CHANGELOG.md](CHANGELOG.md) and [RELEASE_NOTES.md](RELEASE_NOTES.md).
