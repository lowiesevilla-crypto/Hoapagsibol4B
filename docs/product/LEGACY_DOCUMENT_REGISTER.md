# HOAHub Legacy Document Register

**Status:** Current  
**Owner:** Lowie M. Sevilla  
**Last reviewed:** August 5, 2026

## Purpose

This register classifies historical working files that remain in the repository for discovery, audit, UAT, release, or implementation traceability. These files are not the source of truth for executable work.

The product-owner decision recorded in issue #27 is to defer exhaustive backlog migration and GitHub Project adoption. Future work selected from historical material must be restated as a current GitHub Issue with an owner, priority, scope, acceptance criteria, security and tenant-isolation considerations, tests, dependencies, and definition of done.

## Classification

| File or category | Status | Retention purpose | Active-work rule |
|---|---|---|---|
| `PRODUCT_BACKLOG.md` | Superseded | Historical epic and feature snapshot | Do not execute directly; create or update a GitHub Issue when an item is selected |
| `PRODUCT_IMPROVEMENT_BACKLOG.md` | Historical | Product-review, UAT, defect, and improvement discovery ledger | Status labels and unchecked items are historical; confirm current behavior before filing an Issue |
| `SESSION_PROGRESS.md` | Historical | Session-by-session implementation narrative and evidence | Not a roadmap, sprint plan, or source of current status |
| `KNOWN_ISSUES.md` | Historical | Legacy issue register and release evidence | Active defects and enhancements belong in GitHub Issues |
| `IMPLEMENTATION_PLAN.md` | Historical | Earlier implementation sequencing and architecture planning | Revalidate assumptions against current code before creating an Issue |
| `HOAHUB_FUNCTIONAL_AUDIT.md` | Historical | Functional review snapshot | Findings require current reproduction or product-owner selection before becoming active work |
| `CODEX_TASK_*.md` | Historical | Prior implementation briefs and generated work instructions | Completed or abandoned instructions must not be resumed without a current Issue |
| Sprint task and design files | Historical | Sprint-specific design and implementation context | Use only as supporting evidence for a current Issue or PR |
| Release notes and UAT records | Historical evidence | Release traceability and acceptance evidence | Do not edit historical results to represent current behavior |
| Earlier DOCX documentation packages | Historical | Prior user, local setup, and deployment documentation | Current Markdown operations guides take precedence |
| `HOAHUB_PRODUCT_STRATEGY.md` | Superseded placeholder | Preserves the previously empty file path | Commercial MVP and Product Roadmap are authoritative |
| `CODEX_TASK_SPRINT2_3A_FINANCE_INTEGRATION.md` | Historical placeholder | Preserves the previously empty task path | Finance implementation evidence is in merged source, tests, and linked PRs |

## Interpretation rules

1. A historical document may contain `Backlog`, `Testing`, `Pending`, unchecked boxes, future dates, or unresolved recommendations. Those markers do not create active work.
2. GitHub Issues are authoritative for executable work.
3. Merged code, migrations, CI, UAT records, and release evidence determine whether an historical item was delivered.
4. Do not create duplicates solely because the historical wording differs from an existing Issue.
5. When an historical item is selected, first verify current behavior and link the originating file in the new or updated Issue.
6. Sensitive, security, privacy, tenant-isolation, and financial-integrity findings must be handled through the appropriate secure intake and issue workflow.

## Review cadence

Review this register during monthly product documentation review and before each pilot or release scope decision. Add newly superseded working files here rather than allowing them to become competing sources of truth.
