-- Extend HOAHub's reusable commercial feature entitlement model without
-- coupling future sellable capabilities to TenantModule or document-only columns.
ALTER TABLE `SubscriptionPlanFeatureEntitlement`
  ADD COLUMN `configuration` JSON NULL;

ALTER TABLE `TenantFeatureEntitlement`
  ADD COLUMN `configurationOverride` JSON NULL;
