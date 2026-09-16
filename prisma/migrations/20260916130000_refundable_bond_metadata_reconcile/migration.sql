-- Construction and contractor bonds are intrinsically refundable collection types.
-- Older rows can retain the historical defaults (refundable = false,
-- refundStatus = NOT_APPLICABLE), which prevents the supported refund workflow.
-- Normalize metadata only; preserve original amounts, refund/forfeiture totals,
-- receipts, payer ownership, tenant ownership, and closed lifecycle states.
UPDATE `Collection`
SET
  `refundable` = TRUE,
  `refundStatus` = CASE
    WHEN `refundStatus` = 'NOT_APPLICABLE' THEN 'HELD'
    ELSE `refundStatus`
  END
WHERE `type` IN ('CONSTRUCTION_BOND', 'CONTRACTOR_BOND')
  AND (
    `refundable` = FALSE
    OR `refundStatus` = 'NOT_APPLICABLE'
  );
