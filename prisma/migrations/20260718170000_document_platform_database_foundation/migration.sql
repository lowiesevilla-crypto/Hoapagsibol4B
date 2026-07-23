-- HOAHub Sprint 2 Milestone 1: additive Document Platform database foundation.
-- Existing document definitions, templates, requests, versions, numbers, and
-- snapshots are preserved. No certified templates or runtime services are seeded.

ALTER TABLE `User`
  ADD UNIQUE INDEX `User_tenantId_id_key` (`tenantId`, `id`);

ALTER TABLE `DocumentDefinition`
  ADD COLUMN `workflowDefinitionId` VARCHAR(191) NULL AFTER `assignedTemplateVersionId`,
  ADD INDEX `DocumentDefinition_tenantId_workflowDefinitionId_idx` (`tenantId`, `workflowDefinitionId`);

ALTER TABLE `DocumentVersion`
  ADD COLUMN `issuedStatus` ENUM('ISSUED', 'RELEASED', 'REVOKED') NOT NULL DEFAULT 'ISSUED',
  ADD COLUMN `issuedAt` DATETIME(3) NULL,
  ADD COLUMN `releasedAt` DATETIME(3) NULL,
  ADD COLUMN `releasedById` VARCHAR(191) NULL,
  ADD COLUMN `revokedAt` DATETIME(3) NULL,
  ADD COLUMN `revokedById` VARCHAR(191) NULL,
  ADD COLUMN `revocationReason` VARCHAR(191) NULL,
  ADD COLUMN `contentHash` VARCHAR(191) NULL,
  ADD COLUMN `reissueOfId` VARCHAR(191) NULL,
  ADD INDEX `DocumentVersion_tenantId_documentNumber_idx` (`tenantId`, `documentNumber`),
  ADD INDEX `DocumentVersion_tenantId_issuedStatus_createdAt_idx` (`tenantId`, `issuedStatus`, `createdAt`),
  ADD INDEX `DocumentVersion_tenantId_reissueOfId_idx` (`tenantId`, `reissueOfId`);

ALTER TABLE `DocumentRequestHistory`
  ADD COLUMN `workflowVersion` INTEGER NULL,
  ADD COLUMN `workflowStepId` VARCHAR(191) NULL,
  ADD COLUMN `decision` ENUM('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'OVERRIDDEN') NULL,
  ADD COLUMN `actingRole` ENUM('SUPER_ADMIN', 'PLATFORM_ADMIN', 'HOA_ADMIN', 'BILLING_MANAGER', 'PAYROLL_MANAGER', 'STAFF', 'SYSTEM_ADMIN', 'ADMIN', 'HOMEOWNER', 'EMPLOYEE') NULL,
  ADD COLUMN `decisionAt` DATETIME(3) NULL,
  ADD COLUMN `override` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `overrideReason` VARCHAR(191) NULL,
  ADD INDEX `DocumentRequestHistory_tenantId_workflowStepId_createdAt_idx` (`tenantId`, `workflowStepId`, `createdAt`),
  ADD INDEX `DocumentRequestHistory_tenantId_decision_createdAt_idx` (`tenantId`, `decision`, `createdAt`);

ALTER TABLE `DocumentVerificationToken`
  ADD COLUMN `verificationCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lastVerifiedAt` DATETIME(3) NULL;

ALTER TABLE `AuditLog`
  ADD COLUMN `reason` TEXT NULL,
  ADD COLUMN `correlationId` VARCHAR(191) NULL,
  ADD COLUMN `ipAddress` VARCHAR(191) NULL,
  ADD COLUMN `userAgent` TEXT NULL,
  ADD COLUMN `aiAction` BOOLEAN NOT NULL DEFAULT false,
  ADD INDEX `AuditLog_tenantId_createdAt_idx` (`tenantId`, `createdAt`),
  ADD INDEX `AuditLog_tenantId_entityType_entityId_idx` (`tenantId`, `entityType`, `entityId`),
  ADD INDEX `AuditLog_correlationId_idx` (`correlationId`);

ALTER TABLE `NotificationLog`
  MODIFY COLUMN `type` ENUM('ANNOUNCEMENT', 'BILL_REMINDER', 'PASSWORD_RESET', 'WELCOME', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED', 'PAYMENT_CONFIRMATION', 'BILLING_NOTIFICATION', 'TEST_EMAIL', 'EVENT', 'DOCUMENT_REQUEST_SUBMITTED', 'DOCUMENT_APPROVAL_REQUIRED', 'DOCUMENT_READY_FOR_DOWNLOAD', 'DOCUMENT_RELEASED', 'DOCUMENT_REVOKED') NOT NULL;

CREATE TABLE `DocumentPolicy` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default', `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL, `description` TEXT NULL,
  `type` ENUM('OUTSTANDING_BALANCE', 'MEMBERSHIP_STATUS', 'VIOLATION_STATUS', 'BOND_CLEARANCE', 'PROPERTY_OWNERSHIP', 'ACTIVE_RESIDENT', 'CUSTOM_TENANT_POLICY') NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true, `severity` ENUM('INFO', 'WARNING', 'BLOCKING') NOT NULL DEFAULT 'WARNING', `blocking` BOOLEAN NOT NULL DEFAULT false,
  `parameters` JSON NULL, `version` INTEGER NOT NULL DEFAULT 1, `createdById` VARCHAR(191) NULL, `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentPolicy_tenantId_id_key` (`tenantId`, `id`), UNIQUE INDEX `DocumentPolicy_tenantId_code_key` (`tenantId`, `code`),
  INDEX `DocumentPolicy_tenantId_type_enabled_idx` (`tenantId`, `type`, `enabled`), INDEX `DocumentPolicy_tenantId_severity_blocking_idx` (`tenantId`, `severity`, `blocking`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentDefinitionPolicyAssignment` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default', `id` VARCHAR(191) NOT NULL, `definitionId` VARCHAR(191) NOT NULL, `policyId` VARCHAR(191) NOT NULL,
  `evaluationOrder` INTEGER NOT NULL DEFAULT 0, `enabled` BOOLEAN NOT NULL DEFAULT true, `required` BOOLEAN NOT NULL DEFAULT false, `version` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentDefinitionPolicyAssignment_tenantId_id_key` (`tenantId`, `id`), UNIQUE INDEX `DocDefPolicyAssign_tenant_definition_policy_key` (`tenantId`, `definitionId`, `policyId`),
  INDEX `DocDefPolicyAssign_tenant_definition_order_idx` (`tenantId`, `definitionId`, `enabled`, `evaluationOrder`), INDEX `DocDefPolicyAssign_tenant_policy_idx` (`tenantId`, `policyId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentWorkflowDefinition` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default', `id` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL, `description` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true, `version` INTEGER NOT NULL DEFAULT 1, `approvalMode` ENUM('SEQUENTIAL', 'PARALLEL', 'CONDITIONAL') NOT NULL DEFAULT 'SEQUENTIAL', `conditionalMetadata` JSON NULL,
  `createdById` VARCHAR(191) NULL, `updatedById` VARCHAR(191) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentWorkflowDefinition_tenantId_id_key` (`tenantId`, `id`), UNIQUE INDEX `DocumentWorkflowDefinition_tenantId_code_key` (`tenantId`, `code`),
  INDEX `DocumentWorkflowDefinition_tenantId_active_version_idx` (`tenantId`, `active`, `version`), INDEX `DocumentWorkflowDefinition_tenantId_code_active_idx` (`tenantId`, `code`, `active`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentWorkflowStep` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default', `id` VARCHAR(191) NOT NULL, `workflowId` VARCHAR(191) NOT NULL, `stepOrder` INTEGER NOT NULL,
  `stepType` ENUM('APPROVAL', 'REVIEW', 'PAYMENT', 'RELEASE', 'NOTIFICATION') NOT NULL, `approvalMode` ENUM('SEQUENTIAL', 'PARALLEL', 'CONDITIONAL') NOT NULL DEFAULT 'SEQUENTIAL', `conditionalMetadata` JSON NULL,
  `approverRole` ENUM('SUPER_ADMIN', 'PLATFORM_ADMIN', 'HOA_ADMIN', 'BILLING_MANAGER', 'PAYROLL_MANAGER', 'STAFF', 'SYSTEM_ADMIN', 'ADMIN', 'HOMEOWNER', 'EMPLOYEE') NULL, `approverUserId` VARCHAR(191) NULL,
  `required` BOOLEAN NOT NULL DEFAULT true, `slaTargetHours` INTEGER NULL, `overrideEligible` BOOLEAN NOT NULL DEFAULT false, `mandatoryOverrideRemarks` BOOLEAN NOT NULL DEFAULT false,
  `createdById` VARCHAR(191) NULL, `updatedById` VARCHAR(191) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentWorkflowStep_tenantId_id_key` (`tenantId`, `id`), UNIQUE INDEX `DocumentWorkflowStep_tenantId_workflowId_stepOrder_key` (`tenantId`, `workflowId`, `stepOrder`),
  INDEX `DocWorkflowStep_tenant_workflow_order_idx` (`tenantId`, `workflowId`, `required`, `stepOrder`), INDEX `DocWorkflowStep_tenant_approver_idx` (`tenantId`, `approverRole`, `approverUserId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentNumberingConfiguration` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default', `id` VARCHAR(191) NOT NULL, `definitionId` VARCHAR(191) NOT NULL, `prefix` VARCHAR(191) NOT NULL,
  `yearFormat` VARCHAR(191) NOT NULL DEFAULT 'YYYY', `sequenceLength` INTEGER NOT NULL DEFAULT 6, `resetRule` ENUM('ANNUAL', 'CONTINUOUS') NOT NULL DEFAULT 'ANNUAL', `currentSequence` INTEGER NOT NULL DEFAULT 0,
  `lastResetAt` DATETIME(3) NULL, `separator` VARCHAR(191) NOT NULL DEFAULT '-', `suffix` VARCHAR(191) NULL, `manualOverrideAllowed` BOOLEAN NOT NULL DEFAULT false, `version` INTEGER NOT NULL DEFAULT 1,
  `createdById` VARCHAR(191) NULL, `updatedById` VARCHAR(191) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentNumberingConfiguration_tenantId_id_key` (`tenantId`, `id`), UNIQUE INDEX `DocumentNumberingConfiguration_tenantId_definitionId_key` (`tenantId`, `definitionId`),
  INDEX `DocNumberingConfig_tenant_definition_reset_idx` (`tenantId`, `definitionId`, `resetRule`), INDEX `DocNumberingConfig_tenant_prefix_idx` (`tenantId`, `prefix`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentPlaceholderDefinition` (
  `tenantId` VARCHAR(191) NULL, `id` VARCHAR(191) NOT NULL, `ownership` ENUM('PLATFORM', 'TENANT') NOT NULL DEFAULT 'PLATFORM', `key` VARCHAR(191) NOT NULL, `category` VARCHAR(191) NOT NULL,
  `displayName` VARCHAR(191) NOT NULL, `description` TEXT NULL, `dataType` VARCHAR(191) NOT NULL, `formatHint` VARCHAR(191) NULL, `exampleValue` VARCHAR(191) NULL, `sensitivity` VARCHAR(191) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true, `resolverIdentifier` VARCHAR(191) NOT NULL, `aiExplanationMetadata` JSON NULL, `createdById` VARCHAR(191) NULL, `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentPlaceholderDefinition_tenantId_key_key` (`tenantId`, `key`), INDEX `DocumentPlaceholderDefinition_tenantId_ownership_active_idx` (`tenantId`, `ownership`, `active`),
  INDEX `DocumentPlaceholderDefinition_tenantId_category_active_idx` (`tenantId`, `category`, `active`), INDEX `DocumentPlaceholderDefinition_tenantId_resolverIdentifier_idx` (`tenantId`, `resolverIdentifier`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DocumentDefinition`
  ADD CONSTRAINT `DocumentDefinition_tenantId_workflowDefinitionId_fkey` FOREIGN KEY (`tenantId`, `workflowDefinitionId`) REFERENCES `DocumentWorkflowDefinition` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `DocumentVersion`
  ADD CONSTRAINT `DocumentVersion_tenantId_reissueOfId_fkey` FOREIGN KEY (`tenantId`, `reissueOfId`) REFERENCES `DocumentVersion` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `DocumentRequestHistory`
  ADD CONSTRAINT `DocumentRequestHistory_tenantId_workflowStepId_fkey` FOREIGN KEY (`tenantId`, `workflowStepId`) REFERENCES `DocumentWorkflowStep` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `DocumentDefinitionPolicyAssignment`
  ADD CONSTRAINT `DocumentDefinitionPolicyAssignment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentDefinitionPolicyAssignment_tenantId_definitionId_fkey` FOREIGN KEY (`tenantId`, `definitionId`) REFERENCES `DocumentDefinition` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentDefinitionPolicyAssignment_tenantId_policyId_fkey` FOREIGN KEY (`tenantId`, `policyId`) REFERENCES `DocumentPolicy` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `DocumentPolicy`
  ADD CONSTRAINT `DocumentPolicy_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentPolicy_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentPolicy_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `DocumentWorkflowDefinition`
  ADD CONSTRAINT `DocumentWorkflowDefinition_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentWorkflowDefinition_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentWorkflowDefinition_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `DocumentWorkflowStep`
  ADD CONSTRAINT `DocumentWorkflowStep_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentWorkflowStep_tenantId_workflowId_fkey` FOREIGN KEY (`tenantId`, `workflowId`) REFERENCES `DocumentWorkflowDefinition` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentWorkflowStep_tenantId_approverUserId_fkey` FOREIGN KEY (`tenantId`, `approverUserId`) REFERENCES `User` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentWorkflowStep_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentWorkflowStep_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `DocumentNumberingConfiguration`
  ADD CONSTRAINT `DocumentNumberingConfiguration_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentNumberingConfiguration_tenantId_definitionId_fkey` FOREIGN KEY (`tenantId`, `definitionId`) REFERENCES `DocumentDefinition` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentNumberingConfiguration_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentNumberingConfiguration_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `DocumentPlaceholderDefinition`
  ADD CONSTRAINT `DocumentPlaceholderDefinition_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentPlaceholderDefinition_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentPlaceholderDefinition_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
