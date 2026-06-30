# GitHub Workflow

## Source of truth

The canonical repository is `https://github.com/lowiesevilla-crypto/Hoapagsibol4B`. GitHub stores reviewed source and migration history; runtime `.env`, uploads, logs, caches, installers, and database backups are excluded.

## Branches

- `main`: deployable production history; require pull requests and passing CI.
- `develop`: optional integration branch for a group of upcoming changes.
- `feature/description`: normal features.
- `release/version`: release stabilization.
- `hotfix/description`: urgent production correction.
- `codex/description`: Codex implementation prepared for user review.

## Daily beginner workflow

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/short-description
# edit and test
git add path/to/intended/files
git commit -m "feat(module): describe the change"
git push -u origin feature/short-description
gh pr create --draft --base main
```

Use Conventional Commit prefixes: `feat`, `fix`, `refactor`, `docs`, `test`, `build`, `ci`, and `chore`. Keep commits focused. Never commit secrets or generated runtime data.

## Pull request checklist

1. Describe behavior and database impact.
2. Include a migration and rollback note for schema changes.
3. Run `pnpm exec prisma validate`, `pnpm typecheck`, and `pnpm build` locally.
4. Confirm GitHub MySQL CI is green.
5. Obtain review for financial, authentication, or destructive changes.
6. Merge to `main`; do not deploy an unreviewed workstation state.

## Protection settings

In GitHub, open **Settings > Branches > Add branch protection rule** for `main`:

- require pull request before merging
- require the `verify` status check
- require conversation resolution
- prevent force pushes and branch deletion
- restrict direct pushes to trusted maintainers

Add the same status check to `develop` if that branch is used.

## Releases and rollback

Tag production releases after verification:

```bash
git tag -a v2.0.0 -m "HOA Digital Hub 2.0.0"
git push origin v2.0.0
```

The deployment directory uses the Git commit SHA, so operators can switch to an earlier known-good release without rewriting Git history.
