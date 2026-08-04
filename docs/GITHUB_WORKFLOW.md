# GitHub Workflow

**Owner:** Lowie M. Sevilla  
**Last reviewed:** August 5, 2026

## Source of truth

The canonical repository is `https://github.com/lowiesevilla-crypto/Hoapagsibol4B`.

- GitHub stores reviewed source, migrations, issues, pull requests, CI evidence, and release history.
- GitHub Issues are the source of truth for executable work and defects.
- The current GitHub Project is the source of truth for priority, status, iteration/release, owner, effort, risk, and product area.
- Runtime `.env`, uploads, logs, caches, installers, and database backups are excluded from Git.
- Large Markdown backlogs and session/task files are historical or discovery inputs after their actionable work is migrated to Issues.

See [Product Delivery Governance](product/DELIVERY_GOVERNANCE.md) for issue readiness, priority, status, migration, and definition-of-done rules.

## Branches

- `main`: deployable production history; require pull requests and passing CI.
- `develop`: optional integration branch for a coordinated group of upcoming changes.
- `feature/description`: normal features.
- `docs/description`: documentation and governance changes.
- `release/version`: release stabilization.
- `hotfix/description`: urgent production correction.
- `codex/description`: Codex implementation prepared for user review.

Branch from the intended PR base. Keep branches focused and short-lived. Do not combine unrelated features, migrations, refactors, and documentation cleanup in one pull request.

## Issues and delivery tracking

Before implementation:

1. Search open and closed issues for duplicates.
2. Create or refine an issue using the structured feature or bug form.
3. Confirm the problem, scope, exclusions, acceptance criteria, security/tenant impact, tests, dependencies, and definition of done.
4. Add the issue to the HOAHub delivery project.
5. Set product area, work type, priority, target release, effort, risk, owner, and status.
6. Move the issue to `Ready` only when implementation can begin without relying on an untracked task document.

When work starts, assign an owner, move the issue to `In Progress`, and link the branch or draft PR. Use `In Review`, `UAT`, `Done`, and `Deferred` according to the delivery-governance definitions.

## Daily workflow

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

Use Conventional Commit prefixes: `feat`, `fix`, `refactor`, `docs`, `test`, `build`, `ci`, and `chore`. Keep commits focused. Never commit secrets, credentials, private production data, generated runtime files, or backups.

## Pull-request requirements

Every material PR should:

1. Link an issue with `Closes #N`, `Fixes #N`, or `Relates to #N`.
2. Summarize user-visible and operational behavior.
3. Describe database, migration, environment, storage, deployment, and rollback impact.
4. Identify security, privacy, authorization, audit, tenant-isolation, and finance-integrity impact.
5. Include screenshots or other evidence for material UI changes.
6. State the validation performed and any test not performed.
7. Keep unrelated changes out of the PR.
8. Obtain appropriate technical, product, UAT, and operational review.

## Local validation

Run the checks applicable to the change. At minimum for application changes:

```bash
pnpm lint
pnpm exec prisma validate
pnpm exec prisma generate
pnpm typecheck
pnpm build
```

Run all relevant unit, integration, security, tenant-isolation, finance, browser, and verification suites. Database changes also require migration and recovery validation. Documentation-only changes must still pass repository checks unless the workflow explicitly and safely excludes them.

## Pull-request checklist

- [ ] Linked issue is Ready and acceptance criteria are current.
- [ ] Behavior and user/operational impact are described.
- [ ] Security, privacy, authorization, tenant-isolation, audit, and finance impact are assessed.
- [ ] Database/environment/deployment/rollback impact is documented.
- [ ] Required tests and local validation pass.
- [ ] GitHub CI is green.
- [ ] Review conversations are resolved.
- [ ] UAT is completed for user-facing or business-process changes.
- [ ] Documentation and release notes are updated where required.
- [ ] Product owner approves release-impacting scope or exceptions.

## Protection settings

In GitHub, open **Settings > Branches > Add branch protection rule** for `main`:

- require a pull request before merging;
- require the `verify` status check and future mandatory test checks;
- require conversation resolution;
- prevent force pushes and branch deletion;
- restrict direct pushes to trusted maintainers;
- require review for financial, authentication, authorization, tenant-isolation, destructive, privacy, or migration changes.

Add equivalent checks to `develop` if that branch is actively used.

## Merge and completion

Merge only after required CI, review, and UAT gates pass. Closing an issue requires merged implementation and complete definition-of-done evidence; opening a PR alone does not make the issue Done.

Use squash, rebase, or merge according to repository policy, preserving meaningful traceability. Do not deploy an unreviewed workstation state.

## Releases and rollback

Tag production releases after verification:

```bash
git tag -a v2.0.0 -m "HOA Digital Hub 2.0.0"
git push origin v2.0.0
```

The deployment directory uses the Git commit SHA, so operators can switch to an earlier known-good release without rewriting Git history. A rollback does not replace database restore or forward-recovery procedures where data/schema changes are involved.
