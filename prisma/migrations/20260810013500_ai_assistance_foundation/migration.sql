ALTER TABLE `RepositoryDocument`
  ADD COLUMN `aiEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `privacyClassification` ENUM('PUBLIC','INTERNAL','PERSONAL','SENSITIVE','RESTRICTED') NOT NULL DEFAULT 'INTERNAL';

CREATE INDEX `RepositoryDocument_ai_eligibility_idx`
  ON `RepositoryDocument`(`tenantId`, `aiEnabled`, `status`, `visibility`);
CREATE INDEX `RepositoryDocument_privacy_ai_idx`
  ON `RepositoryDocument`(`tenantId`, `privacyClassification`, `aiEnabled`);

CREATE TABLE `TenantAiConfiguration` (
  `tenantId` VARCHAR(191) NOT NULL,
  `runtimeEnabled` BOOLEAN NOT NULL DEFAULT false,
  `residentAssistantEnabled` BOOLEAN NOT NULL DEFAULT false,
  `staffCopilotEnabled` BOOLEAN NOT NULL DEFAULT false,
  `documentRequestActionsEnabled` BOOLEAN NOT NULL DEFAULT false,
  `boardApprovedAt` DATETIME(3) NULL,
  `piaApprovedAt` DATETIME(3) NULL,
  `dpoApprovedAt` DATETIME(3) NULL,
  `providerApprovedAt` DATETIME(3) NULL,
  `crossBorderReviewApprovedAt` DATETIME(3) NULL,
  `privacyNoticeVersion` VARCHAR(80) NULL,
  `privacyNoticePublishedAt` DATETIME(3) NULL,
  `lawfulBasis` VARCHAR(120) NULL,
  `retentionDays` INTEGER NOT NULL DEFAULT 30,
  `dataSubjectRightsContact` VARCHAR(190) NULL,
  `killSwitchReason` TEXT NULL,
  `approvedById` VARCHAR(191) NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`tenantId`),
  INDEX `TenantAiConfiguration_runtimeEnabled_updatedAt_idx`(`runtimeEnabled`, `updatedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TenantAiProviderIndex` (
  `tenantId` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(40) NOT NULL DEFAULT 'OPENAI',
  `vectorStoreId` VARCHAR(190) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`tenantId`),
  UNIQUE INDEX `TenantAiProviderIndex_vectorStoreId_key`(`vectorStoreId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiKnowledgeBinding` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `documentId` VARCHAR(191) NOT NULL,
  `revision` INTEGER NOT NULL,
  `provider` VARCHAR(40) NOT NULL DEFAULT 'OPENAI',
  `providerFileId` VARCHAR(190) NULL,
  `vectorStoreId` VARCHAR(190) NULL,
  `indexStatus` ENUM('NOT_INDEXED','PENDING','INDEXED','FAILED','PURGED') NOT NULL DEFAULT 'NOT_INDEXED',
  `indexedChecksumSha256` VARCHAR(64) NULL,
  `indexedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdById` VARCHAR(191) NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AiKnowledgeBinding_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `AiKnowledgeBinding_tenantId_documentId_key`(`tenantId`, `documentId`),
  INDEX `AiKnowledgeBinding_tenantId_indexStatus_updatedAt_idx`(`tenantId`, `indexStatus`, `updatedAt`),
  INDEX `AiKnowledgeBinding_tenantId_vectorStoreId_idx`(`tenantId`, `vectorStoreId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiConversation` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NOT NULL,
  `actorRole` VARCHAR(60) NOT NULL,
  `status` ENUM('ACTIVE','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AiConversation_tenantId_id_key`(`tenantId`, `id`),
  INDEX `AiConversation_tenantId_actorId_updatedAt_idx`(`tenantId`, `actorId`, `updatedAt`),
  INDEX `AiConversation_tenantId_expiresAt_idx`(`tenantId`, `expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiMessage` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `conversationId` VARCHAR(191) NOT NULL,
  `role` ENUM('USER','ASSISTANT','SYSTEM') NOT NULL,
  `contentRedacted` TEXT NOT NULL,
  `privacyClassification` ENUM('PUBLIC','INTERNAL','PERSONAL','SENSITIVE','RESTRICTED') NOT NULL DEFAULT 'INTERNAL',
  `sourceDocumentIds` JSON NULL,
  `providerRequestId` VARCHAR(190) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AiMessage_tenantId_id_key`(`tenantId`, `id`),
  INDEX `AiMessage_tenantId_conversationId_createdAt_idx`(`tenantId`, `conversationId`, `createdAt`),
  CONSTRAINT `AiMessage_tenantId_conversationId_fkey`
    FOREIGN KEY (`tenantId`, `conversationId`) REFERENCES `AiConversation`(`tenantId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiUsageLedger` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(190) NOT NULL,
  `provider` VARCHAR(40) NOT NULL DEFAULT 'OPENAI',
  `model` VARCHAR(120) NULL,
  `inputTokens` INTEGER NOT NULL DEFAULT 0,
  `outputTokens` INTEGER NOT NULL DEFAULT 0,
  `estimatedCostCentavos` INTEGER NOT NULL DEFAULT 0,
  `latencyMs` INTEGER NULL,
  `outcome` ENUM('SUCCEEDED','DENIED','REFUSED','RATE_LIMITED','QUOTA_BLOCKED','PROVIDER_ERROR') NOT NULL,
  `denialReason` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AiUsageLedger_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `AiUsageLedger_tenantId_requestId_key`(`tenantId`, `requestId`),
  INDEX `AiUsageLedger_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
  INDEX `AiUsageLedger_tenantId_actorId_createdAt_idx`(`tenantId`, `actorId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiFeedback` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NOT NULL,
  `conversationId` VARCHAR(191) NULL,
  `messageId` VARCHAR(191) NULL,
  `rating` INTEGER NULL,
  `flagged` BOOLEAN NOT NULL DEFAULT false,
  `reason` TEXT NULL,
  `resolution` TEXT NULL,
  `resolvedById` VARCHAR(191) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AiFeedback_tenantId_id_key`(`tenantId`, `id`),
  INDEX `AiFeedback_tenantId_flagged_resolvedAt_idx`(`tenantId`, `flagged`, `resolvedAt`),
  INDEX `AiFeedback_tenantId_createdAt_idx`(`tenantId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
