-- Preserve existing tenant module access before the active Platform plan becomes
-- the authoritative runtime capability ceiling.
--
-- Existing installations can pre-date SubscriptionPlan/TenantSubscription and
-- only have Tenant.subscriptionPlan plus TenantModuleEntitlement rows. For any
-- such tenant whose legacy plan code is not already present in the Platform
-- catalog, materialize a tenant-specific migrated plan with the exact enabled
-- module set. Existing Platform catalog plans are never overwritten.

INSERT INTO `SubscriptionPlan` (
  `id`, `code`, `name`, `description`, `active`, `currency`, `trialDays`, `createdAt`, `updatedAt`
)
SELECT
  CONCAT('migrated_plan_', LEFT(SHA2(t.`id`, 256), 32)),
  CONCAT('MIGRATED_', LEFT(SHA2(t.`id`, 256), 32)),
  LEFT(CONCAT('Migrated ', t.`subscriptionPlan`, ' - ', t.`shortName`), 191),
  'Automatically created to preserve pre-control-plane tenant module entitlements. Review and replace with a managed HOAHub plan when commercially appropriate.',
  true,
  'PHP',
  0,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `Tenant` t
WHERE NOT EXISTS (
  SELECT 1 FROM `TenantSubscription` ts WHERE ts.`tenantId` = t.`id`
)
AND NOT EXISTS (
  SELECT 1 FROM `SubscriptionPlan` sp WHERE sp.`code` = t.`subscriptionPlan`
);

-- Copy the exact enabled legacy module set into each tenant-specific migrated
-- plan. Disabled legacy rows remain disabled because they are intentionally not
-- copied into the effective plan module set.
INSERT INTO `SubscriptionPlanModule` (
  `planId`, `module`, `enabled`, `createdAt`, `updatedAt`
)
SELECT
  CONCAT('migrated_plan_', LEFT(SHA2(t.`id`, 256), 32)),
  e.`module`,
  true,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `Tenant` t
JOIN `TenantModuleEntitlement` e
  ON e.`tenantId` = t.`id` AND e.`enabled` = true
JOIN `SubscriptionPlan` sp
  ON sp.`id` = CONCAT('migrated_plan_', LEFT(SHA2(t.`id`, 256), 32))
WHERE NOT EXISTS (
  SELECT 1 FROM `TenantSubscription` ts WHERE ts.`tenantId` = t.`id`
)
ON DUPLICATE KEY UPDATE
  `enabled` = VALUES(`enabled`),
  `updatedAt` = VALUES(`updatedAt`);

-- Point only tenants that received a tenant-specific migrated plan at that plan
-- code. Tenants already backed by an existing Platform catalog plan keep their
-- configured code unchanged.
UPDATE `Tenant` t
JOIN `SubscriptionPlan` sp
  ON sp.`id` = CONCAT('migrated_plan_', LEFT(SHA2(t.`id`, 256), 32))
SET
  t.`subscriptionPlan` = sp.`code`,
  t.`updatedAt` = CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (
  SELECT 1 FROM `TenantSubscription` ts WHERE ts.`tenantId` = t.`id`
);

-- Give every legacy tenant an authoritative subscription record. This migration
-- deliberately does not invent a billing date or price for historical accounts;
-- commercial billing can then be explicitly normalized by Platform Admin without
-- generating surprise invoices. New tenant onboarding initializes its billing
-- schedule in application code.
INSERT INTO `TenantSubscription` (
  `id`, `tenantId`, `planId`, `status`, `billingFrequency`, `startedAt`,
  `currency`, `createdAt`, `updatedAt`
)
SELECT
  CONCAT('migrated_sub_', LEFT(SHA2(t.`id`, 256), 32)),
  t.`id`,
  sp.`id`,
  t.`subscriptionStatus`,
  'MONTHLY',
  t.`createdAt`,
  sp.`currency`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `Tenant` t
JOIN `SubscriptionPlan` sp
  ON sp.`code` = t.`subscriptionPlan`
WHERE NOT EXISTS (
  SELECT 1 FROM `TenantSubscription` ts WHERE ts.`tenantId` = t.`id`
);
