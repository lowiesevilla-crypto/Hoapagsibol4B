# Receipt / Acknowledgement Receipt Half-A4 Print Readability Hotfix

Date: 2026-08-24

## Problem

Browser print already uses A4 portrait paper with the Receipt/AR occupying the top half of the sheet, but the print-only CSS compressed typography too aggressively. This caused very small text and a cramped header where the tenant logo, tenant identity, and receipt-number block could visually collide.

## Fix

- Preserve the existing physical print contract: A4 portrait paper, Receipt/AR in the top half, lower half blank.
- Increase print body, table, metadata, and signature typography to readable minimum sizes.
- Increase the printed tenant logo size while keeping `object-fit: contain`.
- Use an explicit three-column print header grid with dedicated logo and receipt-metadata widths.
- Constrain the tenant identity column with `minmax(0, 1fr)` and controlled wrapping so long tenant names/details cannot overlap the receipt-number block.
- Keep downloaded Receipt/AR PDF behavior unchanged.

## Verification Gate

Run exact-head HOAHub MySQL CI and Canva Visual Parity before merge. Validate browser print preview at A4 portrait with default 100% scale and confirm the entire Receipt/AR remains inside the top half without clipping or overlap.
