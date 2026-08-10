# HOAHub - PAGSIBOL VILLAGE PH2 4B EAST Portal

Production-oriented HOA Digital Hub built with Next.js 15, TypeScript, Tailwind CSS, Prisma, and MySQL 8. It provides role-based administration, homeowner billing and payments, receipts, collections and bonds, payroll, expenses, reports, announcements, events, chat, document generation, and mobile access.

## Requirements

- Node.js 22.13 or newer
- pnpm 11.9.0
- MySQL 8.0 or newer
- Docker Desktop for the included local MySQL service
- Chrome or Chromium for local critical-path browser testing

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

Keep SMTP passwords, Meta tokens, webhook secrets, OpenAI keys, and `AUTH_SECRET` in Hostinger or GitHub secret storage. System Settings may show non-secret configuration, but a server restart is required after changing runtime environment values.

### AI assistance

The live HOAHub assistant is implemented in the product through the resident and staff ask APIs:

- `POST /api/portal/ai/ask` for authenticated homeowner questions.
- `POST /api/admin/ai/ask` for authorized staff/admin questions.

To enable live OpenAI-backed answers in production, configure these server-side environment variables in Hostinger:

```env
AI_RUNTIME_ENABLED="true"
AI_PROVIDER_MODE="openai"
OPENAI_API_KEY="<server-side OpenAI project key>"
OPENAI_MODEL_ECONOMY="gpt-5-nano"
OPENAI_MODEL_STANDARD="gpt-5-mini"
OPENAI_MODEL_PREMIUM="gpt-5"
```

Do not expose the key with a `NEXT_PUBLIC_` prefix. Tenant admins must still enable the AI Assistance entitlement, complete the tenant AI governance approvals, and index approved knowledge documents before the assistant can answer from community sources.

## Database operations

```bash
pnpm exec prisma validate
pnpm db:migrate:deploy
pnpm db:seed
pnpm db:export -- backups/manual.json
pnpm db:import -- backups/manual.json
```

`db:import` replaces the target database contents and verifies every model count. Use it only during an approved migration or restore window after taking a fresh backup.

## Automated testing

Run the deterministic unit suite:

```bash
pnpm test
```

Run the disposable-database finance and tenant-isolation integration suite after migrations and seed:

```bash
pnpm test:integration
```

Run the repository critical regression checks:

```bash
pnpm test:critical
```

The critical browser suite uses the production build, a disposable MySQL database, seeded administrator credentials, two isolated homeowner tenants, and Chrome/Chromium. It performs administrator login, billing preview/generation, payment recording, official receipt validation, homeowner mobile login and SOA access, document-request visibility, announcement publication, and cross-tenant announcement denial.

The fixture command refuses non-CI databases unless local execution is explicitly authorized. Point it only at a disposable local database:

```bash
export HOAHUB_E2E_ALLOW_LOCAL=1
export SEED_SYSTEM_ADMIN_EMAIL="local-e2e-admin@example.invalid"
export SEED_SYSTEM_ADMIN_PASSWORD="replace-with-a-local-test-password"
pnpm db:migrate:deploy
pnpm db:seed
pnpm build
pnpm e2e:prepare
pnpm start
# In another terminal:
pnpm test:e2e
pnpm e2e:cleanup
```

Set `PUPPETEER_EXECUTABLE_PATH` when Chrome or Chromium is not installed at a standard Linux path. See [TESTING_GUIDE.md](TESTING_GUIDE.md) for test-selection and safety requirements.

## Verification

```bash
pnpm lint
pnpm test
pnpm test:integration
pnpm test:critical
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

Pull requests run lint, MySQL migrations, configuration seed, unit and database integration suites, critical regression checks, type checking, a production build, HTTP smoke checks, and the critical browser suite. A successful push to `main` deploys an immutable release to Hostinger when the required repository secrets are configured.

Read these guides before production work:

- [HOAHub production deployment](DEPLOYMENT.md)
- [Production checklist](PRODUCTION_CHECKLIST.md)
- [Testing guide](TESTING_GUIDE.md)
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
