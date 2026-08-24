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

## Verification gate

Run exact-head HOAHub MySQL CI and Canva Visual Parity before merge. Confirm the edit screen opens with the existing payee visibly selected and that pressing Enter in either search field does not submit the form.
