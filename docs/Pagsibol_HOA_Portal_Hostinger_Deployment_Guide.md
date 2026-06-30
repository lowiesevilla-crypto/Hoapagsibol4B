# Hostinger Production Deployment Guide

> The current managed GitHub deployment procedure for `https://hoahub.tech` is maintained in the repository root at `DEPLOYMENT.md`. This document remains the detailed VPS/SSH alternative.

This guide deploys the HOA Digital Hub from local development through GitHub to Hostinger or a similar provider. It targets a Hostinger VPS or hosting plan that supports Node.js 22, persistent Node processes, SSH, MySQL 8, and custom environment variables. Basic static/PHP-only shared hosting cannot run this Next.js server application.

## 1. Accounts and tools

Prepare:

- Hostinger account and a VPS/Node-capable plan
- domain or temporary Hostinger hostname
- GitHub repository administrator access
- local Git, Node.js 22, pnpm 11, Docker Desktop, and Codex
- SSH key pair dedicated to deployment

Never paste production passwords or private keys into source files, issues, screenshots, or chat. Store them in Hostinger and GitHub secrets.

## 2. Local development

Clone the canonical repository and create local configuration:

```powershell
git clone https://github.com/lowiesevilla-crypto/Hoapagsibol4B.git
Set-Location Hoapagsibol4B
Copy-Item .env.example .env
docker compose up -d mysql
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Replace `AUTH_SECRET` and optionally set bootstrap administrator variables. Confirm `http://localhost:3000/login` and `http://localhost:3000/api/health`.

Develop on a branch, run validation, commit, push, and open a pull request. See `GITHUB_WORKFLOW.md`.

## 3. Create the Hostinger MySQL database

In hPanel or your VPS:

1. Create a database such as `hoa_portal`.
2. Create a dedicated database user such as `hoa_app`.
3. Generate a unique password and grant the user privileges only on this database.
4. Record the private database hostname and port.
5. Require MySQL 8.0 or newer and `utf8mb4` character support.

Build the URL, percent-encoding special password characters:

```env
DATABASE_URL="mysql://hoa_app:PERCENT_ENCODED_PASSWORD@MYSQL_HOST:3306/hoa_portal"
```

Do not use the MySQL root account for the application.

## 4. Prepare the server

Connect over SSH:

```bash
ssh HOSTINGER_USER@HOSTINGER_HOST
```

Install or enable Node.js 22, corepack/pnpm, PM2, rsync, MySQL client tools, Git, and Nginx if the plan does not manage the reverse proxy:

```bash
node --version
corepack enable
corepack prepare pnpm@10.12.1 --activate
npm install --global pm2
mysql --version
mysqldump --version
rsync --version
```

Create the release layout. Replace the example path with a directory owned by the SSH user:

```bash
export APP_ROOT="$HOME/apps/pagsibol-hoa"
mkdir -p "$APP_ROOT/releases" "$APP_ROOT/shared/storage" \
  "$APP_ROOT/shared/public-uploads" "$APP_ROOT/backups"
chmod 700 "$APP_ROOT/shared" "$APP_ROOT/backups"
```

Create `$APP_ROOT/shared/.env` with mode `600`:

```env
NODE_ENV="production"
PORT="3000"
APP_URL="https://hoa.example.com"
DATABASE_URL="mysql://hoa_app:ENCODED_PASSWORD@MYSQL_HOST:3306/hoa_portal"
AUTH_SECRET="A_UNIQUE_RANDOM_VALUE_LONGER_THAN_32_CHARACTERS"
SESSION_MAX_AGE_SECONDS="28800"

MAIL_PROVIDER="gmail"
MAIL_HOST="smtp.gmail.com"
MAIL_PORT="587"
MAIL_USERNAME="hoa@example.com"
MAIL_PASSWORD="GOOGLE_APP_PASSWORD"
MAIL_ENCRYPTION="tls"
MAIL_FROM_NAME="PAGSIBOL VILLAGE PH2 4B EAST"
MAIL_FROM_ADDRESS="hoa@example.com"

FACEBOOK_PAGE_ID=""
FACEBOOK_PAGE_ACCESS_TOKEN=""
FACEBOOK_GRAPH_API_VERSION="v23.0"
STORAGE_ROOT="storage"
UPLOAD_MAX_SIZE_MB="10"
```

```bash
chmod 600 "$APP_ROOT/shared/.env"
```

Do not set bootstrap administrator credentials permanently. Use them only for a new empty installation, run the seed once, confirm login, and remove the bootstrap password.

## 5. Configure GitHub secrets

In the repository, open **Settings > Environments > New environment**, create `production`, and optionally require manual approval. Add these environment secrets:

| Secret | Example/purpose |
| --- | --- |
| `HOSTINGER_HOST` | server hostname or IP |
| `HOSTINGER_PORT` | SSH port, normally `22` |
| `HOSTINGER_USER` | restricted deployment SSH user |
| `HOSTINGER_SSH_PRIVATE_KEY` | private deployment key |
| `HOSTINGER_APP_PATH` | `/home/USER/apps/pagsibol-hoa` |
| `HOSTINGER_APP_URL` | `https://hoa.example.com` |

Add the matching public key to `~/.ssh/authorized_keys` on Hostinger. Restrict permissions:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

The deployment workflow never needs the database password because it already exists only in the server's shared `.env`.

## 6. First deployment

Merge a reviewed pull request into `main`. `.github/workflows/ci-deploy.yml` will:

1. Create an isolated MySQL 8.4 CI database.
2. Install locked dependencies.
3. Validate Prisma and deploy migrations.
4. Run the configuration-only seed.
5. Type-check and build the application.
6. Start the build and verify `/api/health` and `/login`.
7. Upload source into `releases/<commit-sha>`.
8. Back up the current database and uploads.
9. Apply production migrations and build on Hostinger.
10. Atomically switch `current` and reload PM2.
11. Verify the public health endpoint.

For the first empty installation, SSH to the release after deployment and run:

```bash
cd "$APP_ROOT/current"
set -a; source "$APP_ROOT/shared/.env"; set +a
SEED_SYSTEM_ADMIN_NAME="System Administrator" \
SEED_SYSTEM_ADMIN_EMAIL="YOUR_ADMIN_EMAIL" \
SEED_SYSTEM_ADMIN_PASSWORD="TEMPORARY_STRONG_PASSWORD" \
pnpm db:seed
```

Change the password immediately and do not save the command containing it in a shared shell history.

## 7. Domain, HTTPS, and reverse proxy

Point the domain's `A` record to the Hostinger server. DNS may take time to propagate. In hPanel, enable the free SSL certificate and force HTTPS.

For a VPS using Nginx, proxy public HTTPS traffic to PM2 on localhost port 3000:

```nginx
server {
    listen 80;
    server_name hoa.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name hoa.example.com;

    client_max_body_size 12m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
    }
}
```

Use Hostinger's SSL tooling or Certbot, test the configuration, and reload Nginx. Update `APP_URL` to the exact HTTPS origin and reload PM2.

## 8. Persistent files

Uploads and generated files live in `$APP_ROOT/shared/storage` and `$APP_ROOT/shared/public-uploads`. Each release symlinks these directories, so deployments do not erase receipts, proofs, logos, signatures, documents, or chat attachments.

Give the application user write access but do not make the directories world-writable:

```bash
chmod -R u+rwX,go-rwx "$APP_ROOT/shared/storage" "$APP_ROOT/shared/public-uploads"
```

For multiple application servers, replace local storage with S3-compatible object storage before scaling.

## 9. Email and Facebook

For Gmail/Google Workspace, enable two-step verification and create an App Password. Put the App Password in the server `.env`; never use the normal Google password. Test from the System Administrator settings screen.

For Facebook Page publishing, create the proper Meta app/Page token, assign the least required Page permissions, add it to the server environment or protected system setting, and test a draft announcement before enabling automatic publishing. Tokens expire or can be revoked, so monitor delivery errors.

## 10. Post-deployment verification

Check after every release:

```bash
curl --fail https://hoa.example.com/api/health
pm2 status
pm2 logs pagsibol-hoa --lines 100
cd "$APP_ROOT/current"
pnpm exec prisma migrate status
```

Then verify manually on desktop and mobile:

- System Administrator, Admin, Homeowner, and Employee login/access boundaries
- dashboard financial totals
- homeowner search, billing, payment, cash/non-cash validation, receipts, and proof images
- documents, PDF/print layout, QR codes, logos, and signatures
- payroll, attendance, deductions/loans, expenses, and reports
- announcements/events and chat attachments
- email reset flow and notification delivery

Check browser console, network errors, and responsive layouts.

## 11. Backups and monitoring

Each deployment creates a pre-migration backup under `$APP_ROOT/backups/<UTC timestamp>`. Configure an additional daily scheduled backup and copy encrypted backups to another provider/account.

Example cron entry at 02:15 daily:

```cron
15 2 * * * APP_ROOT=/home/USER/apps/pagsibol-hoa /bin/bash /home/USER/apps/pagsibol-hoa/current/scripts/backup-production.sh >> /home/USER/apps/pagsibol-hoa/backups/cron.log 2>&1
```

Use Hostinger monitoring or an external uptime monitor against `/api/health`. Alert on non-200 responses, PM2 restarts, disk usage, certificate expiry, failed backups, and MySQL capacity.

## 12. Updates

1. Create a feature/hotfix branch.
2. Implement and test locally against MySQL.
3. Add a forward migration and rollback note if the schema changed.
4. Push and open a pull request.
5. Wait for CI and review.
6. Merge to `main` during an appropriate release window.
7. Verify production and tag the release.

Never edit production source directly because the next immutable deployment will replace it.

## 13. Rollback

List releases and backups:

```bash
ls -lt "$APP_ROOT/releases"
ls -lt "$APP_ROOT/backups"
```

Application-only rollback:

```bash
APP_ROOT="$APP_ROOT" bash "$APP_ROOT/current/scripts/rollback-hostinger.sh" PREVIOUS_COMMIT_SHA
```

If a migration altered incompatible data, use the pre-deployment dump explicitly:

```bash
APP_ROOT="$APP_ROOT" bash "$APP_ROOT/current/scripts/rollback-hostinger.sh" \
  PREVIOUS_COMMIT_SHA "$APP_ROOT/backups/TIMESTAMP/database.sql.gz"
```

Restoring a database discards changes made after that backup. Obtain approval, announce maintenance, preserve the failed state, and verify financial records afterward.

## 14. Security and maintenance checklist

- require GitHub pull requests and passing CI for `main`
- enable GitHub and Hostinger multi-factor authentication
- rotate SSH, database, SMTP, Meta, webhook, and session secrets
- keep Node.js, dependencies, MySQL, and the OS patched
- block public MySQL access; allow only the application/server network
- use a non-root process and database user
- review admin accounts and audit logs regularly
- test backup restoration quarterly
- monitor disk space because uploads and backups grow continuously
- retain financial and payment archives according to HOA policy
