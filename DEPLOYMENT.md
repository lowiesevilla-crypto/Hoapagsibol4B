# HOAHub Deployment Guide

This is the authoritative deployment procedure for `https://hoahub.tech`. The recommended target is Hostinger's managed **Node.js Web App** connected directly to GitHub. The SSH/PM2 scripts under `scripts/` remain available only for a Hostinger VPS.

## Architecture

- Next.js 15 App Router with TypeScript and Tailwind CSS
- Server Actions and Next.js route handlers
- Prisma ORM with MySQL 8 migrations
- bcrypt password hashing and signed HTTP-only session cookies
- Hostinger Email through authenticated SMTP
- persistent filesystem storage configured by `STORAGE_ROOT`
- GitHub repository: `lowiesevilla-crypto/Hoapagsibol4B`
- production branch: `main`

Hostinger managed Node Web Apps require Business Web Hosting or a Cloud plan. VPS hosting also works but requires the separate SSH/PM2 procedure.

## Local development

```powershell
Copy-Item .env.example .env
# Change APP_URL/BASE_URL/API_URL to localhost and use the local MySQL URL.
docker compose up -d mysql
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Local URL: `http://localhost:3000/login`

Before pushing:

```powershell
pnpm exec prisma validate
pnpm typecheck
pnpm build
pnpm smoke:production -- http://127.0.0.1:3000
```

## GitHub update workflow

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/short-description
# Make and verify changes.
git add <intended-files>
git commit -m "feat(module): describe the change"
git push -u origin feature/short-description
gh pr create --draft --base main
```

Merge only after the `verify` GitHub check passes. Hostinger then pulls the new `main` revision and redeploys it.

## Hostinger managed Node setup

1. In hPanel open **Websites > Add Website > Node.js Web App**.
2. Choose **Import Git Repository** and authorize the GitHub account `lowiesevilla-crypto`.
3. Select `lowiesevilla-crypto/Hoapagsibol4B` and branch `main`.
4. Select **Next.js**, package manager **pnpm**, and Node.js **22.x**.
5. Use these commands:

```text
Install command: pnpm install --frozen-lockfile
Build command: pnpm hostinger:build
Start command: pnpm start
Output directory: .next
```

6. Add all production environment variables listed below.
7. Deploy. The build command generates Prisma Client, applies forward MySQL migrations, and builds Next.js.
8. After deployment, open `/api/health`; it must return `status: ok` and `database: mysql`.

Hostinger stores Next.js backend output under `/home/<username>/domains/<domain>/nodejs` and manages the web process/reverse proxy. Do not manually place the application in `public_html`.

## Domain and SSL

1. Add or connect `hoahub.tech` to the Node.js Web App.
2. Point the domain to the nameservers or DNS records displayed by Hostinger.
3. Enable the Hostinger SSL certificate for `hoahub.tech`.
4. Force HTTPS in hPanel if that toggle is available.
5. Keep `APP_URL`, `BASE_URL`, `API_URL`, and `ALLOWED_ORIGINS` set exactly as shown below.

The application also canonicalizes production traffic to `https://hoahub.tech` and sends HSTS/security headers. Add `www.hoahub.tech` to `ALLOWED_ORIGINS` only if it will be served; otherwise redirect `www` to the apex domain in Hostinger.

## Hostinger MySQL

1. Open **Websites > Dashboard > Databases > Management**.
2. Create a database and a dedicated user with a unique password.
3. Copy the exact database name, username, hostname, and port shown by hPanel.
4. URL-encode special characters in the password.
5. Build `DATABASE_URL` using the actual hostname shown by hPanel:

```env
DATABASE_URL="mysql://DB_USER:URL_ENCODED_PASSWORD@DB_HOST:3306/DB_NAME"
```

Production schema updates use only:

```bash
pnpm exec prisma migrate deploy
```

Never run `prisma migrate reset` or `prisma db push` in production. New installations may run `pnpm db:seed`; the seed creates configuration/lookups only. Existing data migrations use `pnpm db:import -- backup.json` only during an approved maintenance window after a separate backup.

## Production environment variables

Enter these in the Hostinger Node.js application environment screen. Do not create or commit a production `.env` file.

```env
NODE_ENV=production
APP_URL=https://hoahub.tech
BASE_URL=https://hoahub.tech
API_URL=https://hoahub.tech/api
ALLOWED_ORIGINS=https://hoahub.tech
DATABASE_URL=mysql://DB_USER:URL_ENCODED_PASSWORD@DB_HOST:3306/DB_NAME
AUTH_SECRET=GENERATE_A_UNIQUE_32_PLUS_CHARACTER_SECRET
SESSION_MAX_AGE_SECONDS=28800
CRON_SECRET=GENERATE_A_DIFFERENT_RANDOM_SECRET
MONTHLY_DUES_DUE_DAY=15

MAIL_PROVIDER=smtp
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USERNAME=admin@hoahub.tech
SMTP_PASSWORD=HOSTINGER_EMAIL_PASSWORD
SMTP_ENCRYPTION=ssl
MAIL_FROM_ADDRESS=noreply@hoahub.tech
MAIL_FROM_NAME=HOAHUB
MAIL_REPLY_TO=admin@hoahub.tech

PASSWORD_RESET_EXPIRY_MINUTES=60
PASSWORD_MIN_LENGTH=10
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBER=true
PASSWORD_REQUIRE_SPECIAL=true

STORAGE_ROOT=/home/HOSTINGER_USERNAME/domains/hoahub.tech/storage
UPLOAD_MAX_SIZE_MB=10
```

Optional Facebook variables:

```env
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
FACEBOOK_GRAPH_API_VERSION=v23.0
```

Generate secrets locally without sharing the output:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

## SMTP and email

1. In hPanel open **Emails**, create `admin@hoahub.tech`, and create/authorize `noreply@hoahub.tech` as a mailbox or sender alias.
2. Use `smtp.hostinger.com`, SSL port `465`; STARTTLS port `587` is the fallback.
3. Keep `SMTP_PASSWORD` only in Hostinger environment variables.
4. If Hostinger requires the From address to match authentication, temporarily set `MAIL_FROM_ADDRESS=admin@hoahub.tech` until `noreply@hoahub.tech` is authorized.
5. Sign in as System Administrator and use **System Settings > Send test email**.

The notification service supports welcome messages, password resets, billing notices/reminders, payment/receipt confirmations, announcements/events, and document/pass approval updates. A dedicated account email-verification workflow and a separate service-request module are not currently present; they are product enhancements, not deployment settings.

## Persistent uploads

Create this writable directory outside Hostinger's replaceable Node build directory:

```text
/home/HOSTINGER_USERNAME/domains/hoahub.tech/storage
```

The application stores all new content under `STORAGE_ROOT/uploads`:

- payment proofs and receipts
- announcement/event images
- chat attachments and resident documents
- organization photos/signatures
- GCash QR/settings images

Do not point `STORAGE_ROOT` inside `.next`, `nodejs`, a Git checkout, or `public_html`. Confirm the Node application user can write to it. Existing legacy files under `public/uploads` remain readable during migration.

## Scheduled jobs

Hostinger cron schedules use UTC. In **Websites > Dashboard > Cron Jobs**, add custom POST commands using the same secret stored in `CRON_SECRET`.

Daily maintenance and reminders at 00:15 UTC (08:15 Manila):

```bash
curl -fsS -X POST https://hoahub.tech/api/cron/daily -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Monthly dues generation on day 1 at 00:30 UTC (08:30 Manila):

```bash
curl -fsS -X POST https://hoahub.tech/api/cron/monthly-dues -H "Authorization: Bearer YOUR_CRON_SECRET"
```

The monthly job is idempotent and respects dues exemptions. Both endpoints return HTTP 401 without the secret and write audit records when authorized.

## Backups

1. Enable Hostinger automatic website/database backups in hPanel.
2. Verify the backup timestamp daily and keep an off-account encrypted copy at least weekly.
3. Before every schema deployment, export MySQL from hPanel or with `mysqldump --single-transaction`.
4. Back up the entire `STORAGE_ROOT` directory with the database dump from the same maintenance window.
5. Perform a quarterly restore drill in a staging database.

The `scripts/backup-production.sh`, immutable release, and rollback scripts are for Hostinger VPS/SSH deployments. Managed Node Web Apps should use hPanel backups and deployment history.

## Post-deployment test

```bash
pnpm smoke:production -- https://hoahub.tech
```

Then test authenticated Admin, Homeowner, System Administrator, and Employee workflows from desktop and mobile. Send a real SMTP test, upload and retrieve a test image/PDF, verify PDF receipts/documents, and remove the test data afterward.

## Troubleshooting

- Build cannot connect to MySQL: verify Hostinger DB hostname, user grants, encoded password, and whether the Node service may access that database.
- Prisma migration fails: stop deployment, keep the previous release active, inspect the migration SQL, and restore the pre-deployment backup if data changed.
- Prisma engine returns `EACCES`: keep the build command set to `pnpm hostinger:build`; it restores Hostinger build permissions before running Prisma.
- 403 after deployment: redeploy the Node.js app so Hostinger regenerates routing; do not manually overwrite `.htaccess`.
- Uploads disappear: `STORAGE_ROOT` is inside the replaceable build directory or lacks write permission.
- SMTP authentication fails: verify full mailbox username, password, port/encryption pair, and authorized From address.
- Redirect loop: confirm Hostinger forwards `X-Forwarded-Proto: https` and all URL variables use exactly `https://hoahub.tech`.
- Health returns 503: inspect Hostinger deployment logs and validate `DATABASE_URL`.
