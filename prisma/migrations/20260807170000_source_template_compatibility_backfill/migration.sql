-- Repair the fixed published-template replication source tenant when legacy
-- DocumentTemplate rows were created after the original 20260716120000
-- compatibility migration had already run.
--
-- Scope is intentionally limited to the three source document types used by
-- the guarded replication workflow. Existing definitions, assigned versions,
-- and target-tenant data are never overwritten.

-- Reuse an existing same-code definition when it predates the legacyType bridge.
UPDATE `DocumentDefinition` d
JOIN `DocumentTemplate` tpl
  ON tpl.`tenantId` = d.`tenantId`
 AND tpl.`type` = d.`code`
SET d.`legacyType` = tpl.`type`,
    d.`updatedAt` = CURRENT_TIMESTAMP(3)
WHERE d.`tenantId` = 'tenant_pagsibol4b_default'
  AND d.`legacyType` IS NULL
  AND tpl.`type` IN ('GATE_PASS', 'MOVE_IN_OUT_PASS', 'CERTIFICATE_OF_RESIDENCY');

-- Create an inactive compatibility definition only when no source definition
-- is available for that legacy type. Inactive prevents this repair from
-- changing source-tenant homeowner document availability.
INSERT INTO `DocumentDefinition` (
  `id`,
  `tenantId`,
  `code`,
  `displayName`,
  `description`,
  `category`,
  `status`,
  `active`,
  `legacyType`,
  `homeownerDownloadEnabled`,
  `walkInEnabled`,
  `createdAt`,
  `updatedAt`
)
SELECT
  CONCAT('dd_', REPLACE(UUID(), '-', '')),
  tpl.`tenantId`,
  CONCAT('SOURCE_COMPAT_', tpl.`type`),
  CASE tpl.`type`
    WHEN 'GATE_PASS' THEN 'Gate Pass'
    WHEN 'MOVE_IN_OUT_PASS' THEN 'Move In / Move Out Pass'
    WHEN 'CERTIFICATE_OF_RESIDENCY' THEN 'Certificate of Residency'
  END,
  'Compatibility definition created from an existing legacy source template for guarded cross-tenant replication.',
  CASE tpl.`type`
    WHEN 'GATE_PASS' THEN 'Pass'
    WHEN 'MOVE_IN_OUT_PASS' THEN 'Pass'
    ELSE 'Certificate'
  END,
  'INACTIVE',
  false,
  tpl.`type`,
  false,
  false,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `DocumentTemplate` tpl
WHERE tpl.`tenantId` = 'tenant_pagsibol4b_default'
  AND tpl.`type` IN ('GATE_PASS', 'MOVE_IN_OUT_PASS', 'CERTIFICATE_OF_RESIDENCY')
  AND NOT EXISTS (
    SELECT 1
    FROM `DocumentDefinition` d
    WHERE d.`tenantId` = tpl.`tenantId`
      AND d.`legacyType` = tpl.`type`
  );

-- Create a tenant-local compatibility set only for source definitions that do
-- not have any set yet. Ownership/editability flags mirror the legacy template.
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
  CONCAT('dts_', REPLACE(UUID(), '-', '')),
  tpl.`tenantId`,
  d.`id`,
  CONCAT(tpl.`title`, ' Compatibility Set'),
  'Compatibility set generated from a legacy source DocumentTemplate.',
  true,
  tpl.`ownershipType`,
  tpl.`upgradeCompatible`,
  tpl.`restorable`,
  tpl.`editable`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `DocumentTemplate` tpl
JOIN `DocumentDefinition` d
  ON d.`tenantId` = tpl.`tenantId`
 AND d.`legacyType` = tpl.`type`
WHERE tpl.`tenantId` = 'tenant_pagsibol4b_default'
  AND tpl.`type` IN ('GATE_PASS', 'MOVE_IN_OUT_PASS', 'CERTIFICATE_OF_RESIDENCY')
  AND NOT EXISTS (
    SELECT 1
    FROM `DocumentTemplateSet` ts
    WHERE ts.`tenantId` = d.`tenantId`
      AND ts.`definitionId` = d.`id`
  );

-- Link the legacy template to its compatibility definition and one existing
-- template set. For newly repaired definitions there is exactly one set.
UPDATE `DocumentTemplate` tpl
JOIN `DocumentDefinition` d
  ON d.`tenantId` = tpl.`tenantId`
 AND d.`legacyType` = tpl.`type`
JOIN (
  SELECT `tenantId`, `definitionId`, MIN(`id`) AS `id`
  FROM `DocumentTemplateSet`
  GROUP BY `tenantId`, `definitionId`
) ts
  ON ts.`tenantId` = d.`tenantId`
 AND ts.`definitionId` = d.`id`
SET tpl.`definitionId` = COALESCE(tpl.`definitionId`, d.`id`),
    tpl.`templateSetId` = COALESCE(tpl.`templateSetId`, ts.`id`),
    tpl.`updatedAt` = CURRENT_TIMESTAMP(3)
WHERE tpl.`tenantId` = 'tenant_pagsibol4b_default'
  AND tpl.`type` IN ('GATE_PASS', 'MOVE_IN_OUT_PASS', 'CERTIFICATE_OF_RESIDENCY');

-- Reconstruct the same schema-v1 compatibility payload used by the original
-- document-definition migration. The source legacy version number is kept
-- exactly; no missing historical version is fabricated.
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
  CONCAT('dtv_', REPLACE(UUID(), '-', '')),
  tpl.`tenantId`,
  tpl.`templateSetId`,
  GREATEST(COALESCE(tpl.`version`, 1), 1),
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
    'source', 'legacy-document-template-post-migration-backfill',
    'legacyTemplateId', tpl.`id`,
    'legacyType', tpl.`type`,
    'legacyVersion', GREATEST(COALESCE(tpl.`version`, 1), 1)
  ),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  tpl.`upgradeCompatible`,
  tpl.`restorable`
FROM `DocumentTemplate` tpl
WHERE tpl.`tenantId` = 'tenant_pagsibol4b_default'
  AND tpl.`type` IN ('GATE_PASS', 'MOVE_IN_OUT_PASS', 'CERTIFICATE_OF_RESIDENCY')
  AND tpl.`templateSetId` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `DocumentTemplateVersion` tv
    WHERE tv.`tenantId` = tpl.`tenantId`
      AND tv.`templateSetId` = tpl.`templateSetId`
      AND tv.`version` = GREATEST(COALESCE(tpl.`version`, 1), 1)
  );

-- Link the legacy template to the exact compatibility version that now exists.
UPDATE `DocumentTemplate` tpl
JOIN `DocumentTemplateVersion` tv
  ON tv.`tenantId` = tpl.`tenantId`
 AND tv.`templateSetId` = tpl.`templateSetId`
 AND tv.`version` = GREATEST(COALESCE(tpl.`version`, 1), 1)
 AND tv.`status` = 'PUBLISHED'
SET tpl.`publishedTemplateVersionId` = COALESCE(tpl.`publishedTemplateVersionId`, tv.`id`),
    tpl.`updatedAt` = CURRENT_TIMESTAMP(3)
WHERE tpl.`tenantId` = 'tenant_pagsibol4b_default'
  AND tpl.`type` IN ('GATE_PASS', 'MOVE_IN_OUT_PASS', 'CERTIFICATE_OF_RESIDENCY');

-- Assign only definitions that currently have no assigned template. Existing
-- source assignments are preserved verbatim.
UPDATE `DocumentDefinition` d
JOIN `DocumentTemplate` tpl
  ON tpl.`tenantId` = d.`tenantId`
 AND tpl.`type` = d.`legacyType`
JOIN `DocumentTemplateVersion` tv
  ON tv.`tenantId` = tpl.`tenantId`
 AND tv.`id` = tpl.`publishedTemplateVersionId`
SET d.`assignedTemplateVersionId` = tv.`id`,
    d.`updatedAt` = CURRENT_TIMESTAMP(3)
WHERE d.`tenantId` = 'tenant_pagsibol4b_default'
  AND d.`legacyType` IN ('GATE_PASS', 'MOVE_IN_OUT_PASS', 'CERTIFICATE_OF_RESIDENCY')
  AND d.`assignedTemplateVersionId` IS NULL;
