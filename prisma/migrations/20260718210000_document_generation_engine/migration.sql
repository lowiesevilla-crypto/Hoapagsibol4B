-- Add the retry-safe generation lifecycle without rewriting historical
-- requests or issued document content.

ALTER TABLE `DocumentVersion`
  ADD COLUMN `capabilitiesSnapshot` JSON NULL,
  ADD COLUMN `contentType` VARCHAR(191) NOT NULL DEFAULT 'text/html; charset=utf-8',
  ADD COLUMN `generationCorrelationId` VARCHAR(191) NULL,
  ADD COLUMN `generationMode` ENUM('PREVIEW', 'VALIDATE', 'ISSUE', 'REISSUE') NOT NULL DEFAULT 'ISSUE',
  ADD COLUMN `idempotencyKey` VARCHAR(191) NULL,
  ADD COLUMN `outputFormat` ENUM('HTML') NOT NULL DEFAULT 'HTML',
  ADD COLUMN `outputSize` INTEGER NULL,
  ADD COLUMN `policySnapshot` JSON NULL,
  ADD COLUMN `rendererName` VARCHAR(191) NULL,
  ADD COLUMN `rendererVersion` VARCHAR(191) NULL,
  ADD COLUMN `resolvedDataSnapshot` JSON NULL,
  ADD COLUMN `sourceTemplateVersionIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `templateSetIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `workflowSnapshot` JSON NULL,
  ADD INDEX `DocumentVersion_tenant_request_idempotency_idx` (`tenantId`, `requestId`, `idempotencyKey`),
  ADD INDEX `DocumentVersion_tenant_correlation_idx` (`tenantId`, `generationCorrelationId`);

CREATE TABLE `DocumentGenerationAttempt` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(191) NOT NULL,
  `mode` ENUM('PREVIEW', 'VALIDATE', 'ISSUE', 'REISSUE') NOT NULL,
  `state` ENUM('NOT_STARTED', 'VALIDATING', 'BLOCKED', 'READY', 'RENDERING', 'GENERATED', 'ISSUED', 'RELEASE_PENDING', 'RELEASED', 'FAILED', 'REVOKED', 'REISSUED') NOT NULL DEFAULT 'NOT_STARTED',
  `idempotencyKey` VARCHAR(191) NULL,
  `attemptNumber` INTEGER NOT NULL DEFAULT 1,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `failureCode` VARCHAR(191) NULL,
  `failureMessage` TEXT NULL,
  `outputFormat` ENUM('HTML') NOT NULL DEFAULT 'HTML',
  `correlationId` VARCHAR(191) NOT NULL,
  `rendererName` VARCHAR(191) NULL,
  `rendererVersion` VARCHAR(191) NULL,
  `documentVersionId` VARCHAR(191) NULL,
  `actorId` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `DocumentGenerationAttempt_tenant_id_key` (`tenantId`, `id`),
  UNIQUE INDEX `DocumentGenerationAttempt_tenant_request_mode_key` (`tenantId`, `requestId`, `mode`, `idempotencyKey`),
  UNIQUE INDEX `DocumentGenerationAttempt_tenant_version_key` (`tenantId`, `documentVersionId`),
  INDEX `DocumentGenerationAttempt_tenant_request_state_idx` (`tenantId`, `requestId`, `state`, `createdAt`),
  INDEX `DocumentGenerationAttempt_tenant_correlation_idx` (`tenantId`, `correlationId`),
  INDEX `DocumentGenerationAttempt_tenant_actor_idx` (`tenantId`, `actorId`, `createdAt`),
  INDEX `DocumentGenerationAttempt_tenant_state_idx` (`tenantId`, `state`, `updatedAt`),
  CONSTRAINT `DocumentGenerationAttempt_tenant_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `DocumentGenerationAttempt_request_fkey`
    FOREIGN KEY (`tenantId`, `requestId`) REFERENCES `DocumentRequest` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `DocumentGenerationAttempt_version_fkey`
    FOREIGN KEY (`tenantId`, `documentVersionId`) REFERENCES `DocumentVersion` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `DocumentGenerationAttempt_actor_fkey`
    FOREIGN KEY (`tenantId`, `actorId`) REFERENCES `User` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
