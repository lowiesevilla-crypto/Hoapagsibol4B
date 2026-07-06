# HOAHub Release Checklist

## Pre-Release Local Checks

- [ ] Confirm branch is correct
- [ ] Run `pnpm typecheck`
- [ ] Run `pnpm build`
- [ ] Run local smoke test
- [ ] Confirm `git status` is clean
- [ ] Commit all approved changes
- [ ] Push feature branch

## Pull Request Checks

- [ ] Create PR into `develop`
- [ ] Confirm GitHub Actions passed
- [ ] Review changed files
- [ ] Merge into `develop`
- [ ] Test `develop`

## Production Release

- [ ] Merge `develop` into `main`
- [ ] Confirm GitHub Actions passed on `main`
- [ ] Confirm Hostinger deployment completed
- [ ] Confirm deployed commit hash matches GitHub

## Production Smoke Test

- [ ] `/login` loads
- [ ] Platform Admin login works
- [ ] Tenant login works
- [ ] HOA Admin dashboard works
- [ ] Payroll Manager access works
- [ ] Billing Manager access works
- [ ] Platform access is blocked for tenant users
- [ ] Cross-tenant login/session isolation works

## Post-Release

- [ ] Update `CHANGELOG.md`
- [ ] Update `KNOWN_ISSUES.md`
- [ ] Tag release if needed
- [ ] Monitor production site