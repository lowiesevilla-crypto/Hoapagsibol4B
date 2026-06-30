# HOAHub Production Checklist

## Before launch

- [ ] Hostinger plan supports managed Node.js Web Apps (Business or Cloud) or a configured VPS.
- [ ] `hoahub.tech` is added to the correct Hostinger website.
- [ ] GitHub repository `lowiesevilla-crypto/Hoapagsibol4B` is connected to Hostinger.
- [ ] Deployment branch is `main` and contains the reviewed HOAHub application.
- [ ] Node.js 22.x and pnpm 11 are selected.
- [ ] Install command is `pnpm install --frozen-lockfile`.
- [ ] Build command is `pnpm hostinger:build`.
- [ ] Start command is `pnpm start`.
- [ ] Output directory is `.next`.
- [ ] GitHub `verify` check passes.
- [ ] `pnpm typecheck`, `pnpm build`, and local production smoke tests pass.

## Secrets and configuration

- [ ] No `.env`, password, token, database dump, upload, or log is committed.
- [ ] `APP_URL` and `BASE_URL` equal `https://hoahub.tech`.
- [ ] `API_URL` equals `https://hoahub.tech/api`.
- [ ] `ALLOWED_ORIGINS` contains only approved HTTPS origins.
- [ ] `AUTH_SECRET` is unique and at least 32 random characters.
- [ ] `CRON_SECRET` is different from `AUTH_SECRET`.
- [ ] Session duration is approved.
- [ ] Facebook/payment secrets are present only when those integrations are enabled.

## MySQL

- [ ] Dedicated Hostinger MySQL database/user created.
- [ ] MySQL password is URL-encoded in `DATABASE_URL`.
- [ ] Fresh database backup completed before migration/import.
- [ ] `prisma migrate deploy` succeeds.
- [ ] `prisma migrate status` reports up to date.
- [ ] Production seed contains only configuration/lookups.
- [ ] Existing homeowner, bill, payment, receipt, payroll, and audit counts reconciled.
- [ ] Restore procedure and responsible operator are documented.

## Email

- [ ] `admin@hoahub.tech` mailbox exists.
- [ ] `noreply@hoahub.tech` mailbox/alias is authorized to send.
- [ ] Hostinger SMTP host, port, username, password, and encryption are configured.
- [ ] From name is `HOAHUB`; Reply-To is `admin@hoahub.tech`.
- [ ] System Administrator SMTP test succeeds.
- [ ] Forgot-password email and one-time link tested.
- [ ] Welcome, billing, reminder, payment, receipt, announcement, and document-update messages tested where their triggers exist.
- [ ] SPF, DKIM, and DMARC status checked in Hostinger DNS/email tools.

## Security

- [ ] SSL certificate is active and trusted.
- [ ] HTTP redirects to HTTPS.
- [ ] Apex/`www` canonical behavior is correct.
- [ ] Secure, HTTP-only, SameSite session cookie confirmed.
- [ ] CSP, HSTS, nosniff, frame, referrer, and permissions headers confirmed.
- [ ] Unapproved CORS origin is rejected.
- [ ] Cross-origin mutations are rejected.
- [ ] Login and password-reset throttling tested.
- [ ] Admin, Homeowner, Employee, and System Administrator route boundaries tested.
- [ ] Payment webhook rejects missing/incorrect secret.
- [ ] Cron endpoints reject missing/incorrect secret.
- [ ] Error pages/logs do not expose credentials, tokens, raw connection strings, or stack traces.

## Files and documents

- [ ] Absolute persistent `STORAGE_ROOT` created outside the build directory.
- [ ] Application process has write/read access to `STORAGE_ROOT`.
- [ ] Announcement image upload/display tested.
- [ ] Payment proof upload/admin preview/download tested.
- [ ] Chat image/PDF/Word/Excel upload and download tested.
- [ ] GCash QR, association logo, officer photos, and signatures tested.
- [ ] Receipt, certificate, clearance, gate pass, and payslip PDF generation tested.
- [ ] Mobile document preview, print, and download tested.
- [ ] Storage directory is included in backups.

## Scheduled operations

- [ ] Daily maintenance cron configured at the intended UTC time.
- [ ] Monthly dues cron configured for day 1 and approved due day.
- [ ] Dues exemptions tested before enabling monthly automation.
- [ ] Cron audit entries and email logs reviewed after the first run.
- [ ] Hostinger automatic daily database/site backups enabled.
- [ ] Off-account encrypted backup configured.
- [ ] Backup restoration tested in staging.

## Functional launch test

- [ ] Homepage/login loads on desktop and mobile.
- [ ] System Administrator login/settings works.
- [ ] Admin dashboard and financial totals work.
- [ ] Homeowner login/profile/billing/payment history works.
- [ ] Employee attendance and paid payslips work.
- [ ] Billing generation, exemptions, and remarks work.
- [ ] Cash and electronic payment validation works.
- [ ] Receipt and transaction coverage displays correctly.
- [ ] Announcements/events publish and display images.
- [ ] Vehicle/sticker and contractor/bond records work.
- [ ] Document requests and generated documents work.
- [ ] Chat messages, presence, unread counts, and attachments work.
- [ ] Financial PDF/DOCX reports generate.
- [ ] No frontend console, API, Prisma, or database constraint errors.

## Known product gaps to track separately

- [ ] Decide whether HOAHub needs account email verification in addition to the existing password-reset/welcome flow.
- [ ] Define and implement a dedicated service-request workflow if document requests are not sufficient.
- [ ] Define contractor-specific approval notifications if contractor creation alone should trigger email.

## After launch

- [ ] `https://hoahub.tech/api/health` returns MySQL `status: ok`.
- [ ] `pnpm smoke:production -- https://hoahub.tech` passes.
- [ ] GitHub-to-Hostinger redeployment tested with a harmless reviewed change.
- [ ] First production database/storage backup downloaded and verified.
- [ ] Hostinger CPU, RAM, process, disk, and error logs monitored for 24 hours.
- [ ] Temporary bootstrap passwords removed and all privileged passwords rotated.
- [ ] Launch date, release commit, database backup ID, and responsible operator recorded.
