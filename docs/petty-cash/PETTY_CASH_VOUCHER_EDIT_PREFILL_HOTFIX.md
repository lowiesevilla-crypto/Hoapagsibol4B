# Petty Cash Voucher Edit Prefill / Search Hotfix

Date: 2026-08-24

## User-reported issue

When editing a Petty Cash Voucher, the saved payee name and voucher data are visible elsewhere on the page, but the payee selector can render blank and fail browser validation. This occurs when the saved tenant-directory record is outside the first 100 rendered search options. Pressing Enter inside the payee search field can also submit the entire voucher form before the user explicitly selects a record.

## Corrected behavior

- Preserve the saved voucher number, transaction date, payee type, payee, address, particulars, amounts, approval, officer, and Employee Cash Advance data when opening Edit Voucher.
- Keep the currently selected payee in the rendered selector even when that record falls outside the first 100 search results.
- Populate the payee search box with the saved payee name and preselect the saved directory record.
- Provide a safe legacy fallback only when an exact saved name is uniquely resolvable (address is used as an additional discriminator when available).
- Typing in payee search and pressing Enter selects the first matching record and updates address / Received By; Enter never submits or saves the voucher.
- Apply the same selected-record retention and Enter-to-select behavior to Employee Cash Advance employee search.
- Only the explicit `Save voucher changes` button submits the edit form.

## Verification outcome

- PR #175 implementation was refreshed onto the current `main` after PR #176 and verified at exact head `a4ffe36f182f069f3e2c0fdca41f010fbbdf0bea`.
- HOAHub MySQL CI #1152 passed, including production smoke and the complete critical browser suite.
- Canva Visual Parity #331 passed.
- PR #175 merged to `main` at `70eda4af51759b491a0ab2380b03a8fc1c76e7c4`.
- Focused Petty Cash and Billing regressions passed locally after the refresh (8 tests).
- Repository implementation and merge are complete. Hostinger production deployment and authenticated production UAT remain separate verification gates.
