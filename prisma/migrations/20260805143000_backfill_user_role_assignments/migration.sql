-- Backfill every legacy User.role into the additive assignment table.
-- Runtime keeps User.role only as a compatibility fallback when no active assignment exists.
INSERT INTO `UserRoleAssignment` (
  `tenantId`,
  `userId`,
  `role`,
  `assignedBy`,
  `assignedAt`,
  `active`
)
SELECT
  `tenantId`,
  `id`,
  `role`,
  NULL,
  `createdAt`,
  true
FROM `User`
ON DUPLICATE KEY UPDATE
  `active` = true;
