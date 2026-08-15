-- HOAHub resident messaging privacy, message requests, and blocking.
-- These tables are intentionally tenant-scoped and accessed through server-side chat policy services.

CREATE TABLE `ChatPrivacyPreference` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `residentMessagingMode` VARCHAR(32) NOT NULL DEFAULT 'REQUESTS',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ChatPrivacyPreference_tenantId_userId_key` (`tenantId`, `userId`),
  KEY `ChatPrivacyPreference_tenantId_idx` (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatUserBlock` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `blockerUserId` VARCHAR(191) NOT NULL,
  `blockedUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ChatUserBlock_tenantId_blocker_blocked_key` (`tenantId`, `blockerUserId`, `blockedUserId`),
  KEY `ChatUserBlock_tenantId_blocked_idx` (`tenantId`, `blockedUserId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatMessageRequest` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `conversationId` VARCHAR(191) NOT NULL,
  `requesterUserId` VARCHAR(191) NOT NULL,
  `recipientUserId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `respondedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ChatMessageRequest_tenantId_conversationId_key` (`tenantId`, `conversationId`),
  KEY `ChatMessageRequest_recipient_status_idx` (`tenantId`, `recipientUserId`, `status`),
  KEY `ChatMessageRequest_requester_status_idx` (`tenantId`, `requesterUserId`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
