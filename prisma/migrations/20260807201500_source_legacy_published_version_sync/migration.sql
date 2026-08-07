-- Materialize the fixed replication source tenant's CURRENT active legacy
-- DocumentTemplate versions into the versioned template model when they are
-- missing there. This is a compatibility bridge only: it never changes a
-- DocumentDefinition assignment and never touches the target tenant.
--
-- Critically, this migration does not manufacture requested history. A source
-- version is created only when the existing active legacy DocumentTemplate row
-- already has exactly the approved requested version number:
--   GATE_PASS                 v2
--   MOVE_IN_OUT_PASS          v1
--   CERTIFICATE_OF_RESIDENCY  v2
--
-- The legacy DocumentTemplate table is unique on (tenantId, type), so the body
-- below is the source tenant's existing current legacy content for that type.

-- Create one compatibility set per matching source definition only when that
-- definition does not already contain the exact requested PUBLISHED version.
INSERT INTO `DocumentTemplateSet` (
  `id`,
  `tenantId`,
  `definitionId`,
  `name`,
  `description`,
  `active`,
  `ownershipType`,
  `upgradeCompatible`,
  `restorable`,
  `editable`,
  `createdAt`,
  `updatedAt`
)
SELECT
  CONCAT(
    'dts_srcsync_',
    SUBSTRING(MD5(CONCAT(d.`id`, '|', tpl.`type`, '|', tpl.`version`)), 1, 24)
  ),
  tpl.`tenantId`,
  d.`id`,
  CONCAT(tpl.`title`, ' Legacy Published Compatibility v', tpl.`version`),
  'Compatibility set materialized from the existing active legacy source template for guarded replication.',
  true,
  tpl.`ownershipType`,
  tpl.`upgradeCompatible`,
  tpl.`restorable`,
  false,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `DocumentTemplate` tpl
JOIN `DocumentDefinition` d
  ON d.`tenantId` = tpl.`tenantId`
 AND d.`legacyType` = tpl.`type`
WHERE tpl.`tenantId` = 'tenant_pagsibol4b_default'
  AND tpl.`active` = true
  AND (
    (tpl.`type` = 'GATE_PASS' AND tpl.`version` = 2)
    OR (tpl.`type` = 'MOVE_IN_OUT_PASS' AND tpl.`version` = 1)
    OR (tpl.`type` = 'CERTIFICATE_OF_RESIDENCY' AND tpl.`version` = 2)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM `DocumentTemplateVersion` existing_version
    JOIN `DocumentTemplateSet` existing_set
      ON existing_set.`tenantId` = existing_version.`tenantId`
     AND existing_set.`id` = existing_version.`templateSetId`
    WHERE existing_version.`tenantId` = tpl.`tenantId`
      AND existing_set.`definitionId` = d.`id`
      AND existing_version.`version` = tpl.`version`
      AND existing_version.`status` = 'PUBLISHED'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM `DocumentTemplateSet` existing_sync_set
    WHERE existing_sync_set.`id` = CONCAT(
      'dts_srcsync_',
      SUBSTRING(MD5(CONCAT(d.`id`, '|', tpl.`type`, '|', tpl.`version`)), 1, 24)
    )
  );

-- Materialize the exact active legacy body as the same schema-v1 compatibility
-- payload used by the platform's prior legacy-template bridges. The source
-- legacy version number is preserved verbatim.
INSERT INTO `DocumentTemplateVersion` (
  `id`,
  `tenantId`,
  `templateSetId`,
  `version`,
  `status`,
  `ownershipType`,
  `schemaVersion`,
  `definitionJson`,
  `previewMetadata`,
  `publishedAt`,
  `createdAt`,
  `updatedAt`,
  `upgradeCompatible`,
  `restorable`
)
SELECT
  CONCAT(
    'dtv_srcsync_',
    SUBSTRING(MD5(CONCAT(d.`id`, '|', tpl.`type`, '|', tpl.`version`, '|published')), 1, 24)
  ),
  tpl.`tenantId`,
  sync_set.`id`,
  tpl.`version`,
  'PUBLISHED',
  tpl.`ownershipType`,
  1,
  JSON_OBJECT(
    'schemaVersion', 1,
    'page', JSON_OBJECT('format', 'A4', 'orientation', 'portrait'),
    'blocks', JSON_ARRAY(
      JSON_OBJECT(
        'id', 'legacy-body',
        'type', 'text',
        'label', 'Legacy template body',
        'text', tpl.`body`,
        'order', 10,
        'visible', true,
        'style', JSON_OBJECT(
          'align', 'left',
          'fontFamily', 'Arial',
          'fontSize', 11
        )
      )
    )
  ),
  JSON_OBJECT(
    'source', 'active-legacy-document-template-published-sync',
    'legacyTemplateId', tpl.`id`,
    'legacyType', tpl.`type`,
    'legacyVersion', tpl.`version`,
    'sourceDefinitionId', d.`id`
  ),
  COALESCE(tpl.`updatedAt`, tpl.`createdAt`),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  tpl.`upgradeCompatible`,
  tpl.`restorable`
FROM `DocumentTemplate` tpl
JOIN `DocumentDefinition` d
  ON d.`tenantId` = tpl.`tenantId`
 AND d.`legacyType` = tpl.`type`
JOIN `DocumentTemplateSet` sync_set
  ON sync_set.`tenantId` = tpl.`tenantId`
 AND sync_set.`definitionId` = d.`id`
 AND sync_set.`id` = CONCAT(
   'dts_srcsync_',
   SUBSTRING(MD5(CONCAT(d.`id`, '|', tpl.`type`, '|', tpl.`version`)), 1, 24)
 )
WHERE tpl.`tenantId` = 'tenant_pagsibol4b_default'
  AND tpl.`active` = true
  AND (
    (tpl.`type` = 'GATE_PASS' AND tpl.`version` = 2)
    OR (tpl.`type` = 'MOVE_IN_OUT_PASS' AND tpl.`version` = 1)
    OR (tpl.`type` = 'CERTIFICATE_OF_RESIDENCY' AND tpl.`version` = 2)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM `DocumentTemplateVersion` existing_version
    WHERE existing_version.`tenantId` = tpl.`tenantId`
      AND existing_version.`templateSetId` = sync_set.`id`
      AND existing_version.`version` = tpl.`version`
  );

-- Deliberately no UPDATE of DocumentDefinition.assignedTemplateVersionId.
-- Deliberately no target-tenant statement.
