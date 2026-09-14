-- Repair placeholder AI token caps that made commercially enabled premium tenants
-- hit "monthly input-token allowance reached" after only a few prompts.
--
-- This migration is intentionally data-only. It preserves tenant isolation and
-- does not delete AI usage/audit history; it only raises obviously placeholder
-- 1,000-token caps on enabled AI Assistance commercial entitlements.

UPDATE `SubscriptionPlanFeatureEntitlement` spfe
JOIN `SubscriptionPlan` sp ON sp.id = spfe.planId
SET spfe.configuration = JSON_SET(
  COALESCE(spfe.configuration, JSON_OBJECT()),
  '$.monthlyInputTokenLimit',
  1000000,
  '$.monthlyOutputTokenLimit',
  500000,
  '$.monthlyRequestLimit',
  GREATEST(
    COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(spfe.configuration, '$.monthlyRequestLimit')) AS UNSIGNED), 1000),
    1000
  ),
  '$.requestsPerMinute',
  GREATEST(
    COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(spfe.configuration, '$.requestsPerMinute')) AS UNSIGNED), 10),
    30
  )
)
WHERE spfe.featureCode = 'AI_ASSISTANCE'
  AND spfe.enabled = true
  AND (
    UPPER(sp.code) LIKE '%PREMIUM%'
    OR UPPER(sp.name) LIKE '%PREMIUM%'
  )
  AND (
    JSON_EXTRACT(spfe.configuration, '$.monthlyInputTokenLimit') IS NULL
    OR CAST(JSON_UNQUOTE(JSON_EXTRACT(spfe.configuration, '$.monthlyInputTokenLimit')) AS UNSIGNED) <= 1000
  );

UPDATE `TenantFeatureEntitlement` tfe
JOIN `Tenant` t ON t.id = tfe.tenantId
SET tfe.configurationOverride = JSON_SET(
  COALESCE(tfe.configurationOverride, JSON_OBJECT()),
  '$.monthlyInputTokenLimit',
  1000000,
  '$.monthlyOutputTokenLimit',
  500000,
  '$.requestsPerMinute',
  GREATEST(
    COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(tfe.configurationOverride, '$.requestsPerMinute')) AS UNSIGNED), 10),
    30
  )
)
WHERE tfe.featureCode = 'AI_ASSISTANCE'
  AND (tfe.enabledOverride IS NULL OR tfe.enabledOverride <> false)
  AND (
    UPPER(t.subscriptionPlan) LIKE '%PREMIUM%'
    OR EXISTS (
      SELECT 1
      FROM `TenantSubscription` ts
      JOIN `SubscriptionPlan` sp ON sp.id = ts.planId
      WHERE ts.tenantId = t.id
        AND ts.status IN ('ACTIVE', 'TRIAL', 'PAST_DUE')
        AND (UPPER(sp.code) LIKE '%PREMIUM%' OR UPPER(sp.name) LIKE '%PREMIUM%')
    )
  )
  AND (
    JSON_EXTRACT(tfe.configurationOverride, '$.monthlyInputTokenLimit') IS NULL
    OR CAST(JSON_UNQUOTE(JSON_EXTRACT(tfe.configurationOverride, '$.monthlyInputTokenLimit')) AS UNSIGNED) <= 1000
  );
