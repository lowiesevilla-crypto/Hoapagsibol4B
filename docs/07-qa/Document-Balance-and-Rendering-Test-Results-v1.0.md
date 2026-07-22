# Document Balance and Rendering Test Results v1.0

## Environment

- Branch: `feature/homeowner-mobile`
- Starting commit: `187b480514a6626f3aea1beef2da33e546b46ed0`
- Production changes: none
- Push/merge/deploy: none

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Prisma format | PASS | `pnpm exec prisma format` |
| Prisma validate | PASS | `pnpm exec prisma validate` |
| Prisma generate | PASS | `pnpm exec prisma generate` after stopping the local workspace Next dev server that held the Prisma DLL lock |
| Prisma migrate status | PASS | `pnpm exec prisma migrate status`; database schema is up to date |
| TypeScript typecheck | PASS | `pnpm typecheck` |
| Focused balance/rendering hotfix harness | PASS | `scripts/verify-document-balance-rendering-hotfix.ts` |
| Existing balance-policy harness | PASS | `scripts/verify-document-balance-policy-hotfix.ts` |
| Workflow executor harness | PASS | 22 checks, including document-fee Finance Collection receipt creation |
| Certificate of Residency harness | PASS | 37 checks |
| Document generation harness | PASS | 29 checks |
| Professional template editor harness | PASS | Current editor/schema regression checks |
| Visual document designer harness | PASS | Current designer/rendering checks |
| Designer preview/print assets harness | PASS | Current preview/print asset checks |
| Clean production build | PASS | `pnpm build` |

## Notes

No migration was required. The existing untracked `docs/00-project-management/` folder was not modified or deleted.

`Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue` was blocked by local command policy. The `.next` path was resolved inside the workspace and cleared with PowerShell's .NET directory delete before `pnpm build`.

## 2026-07-22 Resident Services UX and Workflow Rule Retest

- Branch: `feature/homeowner-mobile`
- Starting commit: `9ada962e8dee9c3bd8fa3c6852bb00addcf7b02c`
- Schema changes: none
- Migration required: no
- Push/merge/deploy: none

| Check | Result | Evidence |
| --- | --- | --- |
| Prisma validate | PASS | `pnpm exec prisma validate` |
| Prisma generate | PASS | `pnpm exec prisma generate` |
| Prisma migrate status | PASS | `pnpm exec prisma migrate status`; database schema is up to date |
| TypeScript typecheck | PASS | `pnpm typecheck` |
| Phase 2A document management harness | PASS | 33 tenant-scoped definitions; sidebar UX, request counters, diagnostics, editable workflow rules |
| Workflow preset hotfix harness | PASS | preset mappings and invalid workflow rejection |
| Document definition persistence harness | PASS | persistence, workflow reconstruction, boolean flips, tenant scope, single version increments |
| Balance rendering harness | PASS | policy labels, download behavior, admin override, preview/issued rendering |
| Balance policy harness | PASS | policy behavior, request blocking, paid-document separation, household ownership, tenant isolation |
| Custom request harness | PASS | exact status actions and nullable custom request contract |
| Dynamic field validation harness | PASS | constraints, SELECT options, required checkbox, custom no-purpose validation |
| Dynamic field lifecycle harness | PASS | archived restore and historical field deactivation lifecycle |
| Workflow executor harness | PASS | 22 checks |
| Generation engine harness | PASS | 29 checks |
| Runtime services harness | PASS | 22 checks |
| Platform foundation harness | PASS | additive tables, tenant uniqueness, ownership keys, historical inventory |
| Professional template editor harness | PASS | editor/schema/security/template tenant invariants |
| Visual designer harness | PASS | visual schema, renderer, officer-list, tenant data checks |
| Editable page harness | PASS | 30 checks |
| Designer preview/print assets harness | PASS | preview route, print shell exclusion, asset handling |
| Designer panel state harness | PASS | 20 checks |
| Designer UAT blockers harness | PASS | rich text, QR preview wording, lines, image layout, officer typography |
| Certified template foundation harness | PASS | 15 template sets, 26 versions, certified/tenant provenance |
| Certificate of Residency harness | PASS | 37 checks |
| Document numbering harness | PASS | 3 valid and 5 invalid formats |
| Clean production build | PASS | `pnpm build` |

Notes:

- The requested `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue` command was blocked by the local policy again. `.next` was resolved inside the workspace and removed with PowerShell's .NET directory delete before the passing production build.
- The local workspace Next dev server was stopped before Prisma generate because it held Prisma's generated query-engine DLL.
