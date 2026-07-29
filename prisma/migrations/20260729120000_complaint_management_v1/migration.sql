-- Additive Complaint Management MVP schema.
-- Rollback note: drop the complaint tables in reverse dependency order and
-- delete COMPLAINTS TenantModuleEntitlement rows inserted by this migration.

CREATE TABLE `ComplaintSetting` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `intakeEnabled` BOOLEAN NOT NULL DEFAULT true,
  `namedEnabled` BOOLEAN NOT NULL DEFAULT true,
  `confidentialEnabled` BOOLEAN NOT NULL DEFAULT true,
  `anonymousEnabled` BOOLEAN NOT NULL DEFAULT true,
  `maxAttachmentMb` INTEGER NOT NULL DEFAULT 10,
  `allowedMimeTypes` VARCHAR(500) NOT NULL DEFAULT 'image/jpeg,image/png,image/webp,application/pdf',
  `acknowledgementSlaHours` INTEGER NOT NULL DEFAULT 72,
  `resolutionSlaDays` INTEGER NOT NULL DEFAULT 14,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ComplaintSetting_tenantId_key`(`tenantId`),
  INDEX `ComplaintSetting_tenantId_idx`(`tenantId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintCategory` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `requiresBoardReview` BOOLEAN NOT NULL DEFAULT false,
  `displayOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ComplaintCategory_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `ComplaintCategory_tenantId_code_key`(`tenantId`, `code`),
  INDEX `ComplaintCategory_tenantId_active_displayOrder_idx`(`tenantId`, `active`, `displayOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Complaint` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `complaintNumber` VARCHAR(191) NOT NULL,
  `publicReference` VARCHAR(191) NOT NULL,
  `privacyMode` ENUM('NAMED', 'CONFIDENTIAL', 'ANONYMOUS') NOT NULL,
  `status` ENUM('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'TRIAGED', 'ASSIGNED', 'UNDER_REVIEW', 'WAITING_FOR_INFORMATION', 'ACTION_IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED', 'REJECTED', 'WITHDRAWN', 'REFERRED', 'ARCHIVED') NOT NULL DEFAULT 'SUBMITTED',
  `title` VARCHAR(191) NOT NULL,
  `categoryId` VARCHAR(191) NULL,
  `severity` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
  `description` TEXT NOT NULL,
  `location` VARCHAR(191) NULL,
  `incidentDate` DATE NULL,
  `submittedById` VARCHAR(191) NULL,
  `homeownerId` VARCHAR(191) NULL,
  `assignedToId` VARCHAR(191) NULL,
  `dueAt` DATETIME(3) NULL,
  `acknowledgedAt` DATETIME(3) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `closedAt` DATETIME(3) NULL,
  `reopenedAt` DATETIME(3) NULL,
  `resolutionSummary` TEXT NULL,
  `withdrawalReason` TEXT NULL,
  `adminPrivateNotes` TEXT NULL,
  `canNotifyByEmail` BOOLEAN NOT NULL DEFAULT true,
  `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Complaint_publicReference_key`(`publicReference`),
  UNIQUE INDEX `Complaint_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `Complaint_tenantId_complaintNumber_key`(`tenantId`, `complaintNumber`),
  INDEX `Complaint_tenantId_status_submittedAt_idx`(`tenantId`, `status`, `submittedAt`),
  INDEX `Complaint_tenantId_privacyMode_submittedAt_idx`(`tenantId`, `privacyMode`, `submittedAt`),
  INDEX `Complaint_tenantId_categoryId_idx`(`tenantId`, `categoryId`),
  INDEX `Complaint_tenantId_homeownerId_idx`(`tenantId`, `homeownerId`),
  INDEX `Complaint_submittedById_idx`(`submittedById`),
  INDEX `Complaint_assignedToId_idx`(`assignedToId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintConfidentialIdentity` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `homeownerId` VARCHAR(191) NULL,
  `displayName` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `propertyAddress` VARCHAR(191) NULL,
  `block` VARCHAR(191) NULL,
  `lot` VARCHAR(191) NULL,
  `identityNote` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ComplaintConfidentialIdentity_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `ComplaintConfidentialIdentity_tenantId_complaintId_key`(`tenantId`, `complaintId`),
  INDEX `ComplaintConfidentialIdentity_tenantId_homeownerId_idx`(`tenantId`, `homeownerId`),
  INDEX `ComplaintConfidentialIdentity_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintTrackingCredential` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `trackingCode` VARCHAR(191) NOT NULL,
  `pinHash` VARCHAR(191) NOT NULL,
  `lastAccessAt` DATETIME(3) NULL,
  `disabledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ComplaintTrackingCredential_trackingCode_key`(`trackingCode`),
  UNIQUE INDEX `ComplaintTrackingCredential_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `ComplaintTrackingCredential_tenantId_complaintId_key`(`tenantId`, `complaintId`),
  INDEX `ComplaintTrackingCredential_tenantId_trackingCode_idx`(`tenantId`, `trackingCode`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintAttachment` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `uploaderId` VARCHAR(191) NULL,
  `originalName` VARCHAR(191) NOT NULL,
  `storedName` VARCHAR(191) NOT NULL,
  `url` VARCHAR(191) NOT NULL,
  `contentType` VARCHAR(191) NOT NULL,
  `fileSize` INTEGER NOT NULL,
  `sha256` VARCHAR(191) NOT NULL,
  `visibility` ENUM('COMPLAINANT', 'STAFF', 'CONFIDENTIAL_IDENTITY') NOT NULL DEFAULT 'COMPLAINANT',
  `malwareStatus` ENUM('NOT_CONFIGURED', 'PENDING', 'PASSED', 'FAILED', 'BLOCKED') NOT NULL DEFAULT 'NOT_CONFIGURED',
  `scanNotes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ComplaintAttachment_tenantId_id_key`(`tenantId`, `id`),
  INDEX `ComplaintAttachment_tenantId_complaintId_visibility_idx`(`tenantId`, `complaintId`, `visibility`),
  INDEX `ComplaintAttachment_uploaderId_idx`(`uploaderId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintMessage` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `authorId` VARCHAR(191) NULL,
  `authorDisplayName` VARCHAR(191) NULL,
  `visibility` ENUM('PUBLIC', 'INTERNAL', 'CONFIDENTIAL') NOT NULL DEFAULT 'PUBLIC',
  `body` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ComplaintMessage_tenantId_id_key`(`tenantId`, `id`),
  INDEX `ComplaintMessage_tenantId_complaintId_visibility_createdAt_idx`(`tenantId`, `complaintId`, `visibility`, `createdAt`),
  INDEX `ComplaintMessage_authorId_idx`(`authorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintStatusHistory` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `fromStatus` ENUM('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'TRIAGED', 'ASSIGNED', 'UNDER_REVIEW', 'WAITING_FOR_INFORMATION', 'ACTION_IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED', 'REJECTED', 'WITHDRAWN', 'REFERRED', 'ARCHIVED') NULL,
  `toStatus` ENUM('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'TRIAGED', 'ASSIGNED', 'UNDER_REVIEW', 'WAITING_FOR_INFORMATION', 'ACTION_IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED', 'REJECTED', 'WITHDRAWN', 'REFERRED', 'ARCHIVED') NOT NULL,
  `actorId` VARCHAR(191) NULL,
  `note` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ComplaintStatusHistory_tenantId_id_key`(`tenantId`, `id`),
  INDEX `ComplaintStatusHistory_tenantId_complaintId_createdAt_idx`(`tenantId`, `complaintId`, `createdAt`),
  INDEX `ComplaintStatusHistory_actorId_idx`(`actorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintTimelineEvent` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NULL,
  `eventType` ENUM('SUBMITTED', 'STATUS_CHANGED', 'COMMENTED', 'ASSIGNED', 'ATTACHMENT_ADDED', 'IDENTITY_ACCESS_REQUESTED', 'IDENTITY_DISCLOSED', 'REOPENED', 'CLOSED', 'SETTINGS_UPDATED') NOT NULL,
  `message` TEXT NOT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ComplaintTimelineEvent_tenantId_id_key`(`tenantId`, `id`),
  INDEX `ComplaintTimelineEvent_tenantId_complaintId_createdAt_idx`(`tenantId`, `complaintId`, `createdAt`),
  INDEX `ComplaintTimelineEvent_actorId_idx`(`actorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintAssignment` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `assigneeId` VARCHAR(191) NOT NULL,
  `assignedById` VARCHAR(191) NULL,
  `roleLabel` VARCHAR(191) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `unassignedAt` DATETIME(3) NULL,
  UNIQUE INDEX `ComplaintAssignment_tenantId_id_key`(`tenantId`, `id`),
  INDEX `ComplaintAssignment_tenantId_complaintId_active_idx`(`tenantId`, `complaintId`, `active`),
  INDEX `ComplaintAssignment_assigneeId_active_idx`(`assigneeId`, `active`),
  INDEX `ComplaintAssignment_assignedById_idx`(`assignedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintIdentityAccessGrant` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `requestedById` VARCHAR(191) NOT NULL,
  `approvedById` VARCHAR(191) NULL,
  `status` ENUM('REQUESTED', 'APPROVED', 'DENIED', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'REQUESTED',
  `purpose` VARCHAR(191) NOT NULL,
  `reason` TEXT NOT NULL,
  `expiresAt` DATETIME(3) NULL,
  `decidedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ComplaintIdentityAccessGrant_tenantId_id_key`(`tenantId`, `id`),
  INDEX `ComplaintIdentityAccessGrant_tenantId_complaintId_status_idx`(`tenantId`, `complaintId`, `status`),
  INDEX `ComplaintIdentityAccessGrant_requestedById_status_idx`(`requestedById`, `status`),
  INDEX `ComplaintIdentityAccessGrant_approvedById_idx`(`approvedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ComplaintSetting` ADD CONSTRAINT `ComplaintSetting_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintCategory` ADD CONSTRAINT `ComplaintCategory_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_tenantId_categoryId_fkey` FOREIGN KEY (`tenantId`, `categoryId`) REFERENCES `ComplaintCategory`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_tenantId_homeownerId_fkey` FOREIGN KEY (`tenantId`, `homeownerId`) REFERENCES `HomeownerProfile`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintConfidentialIdentity` ADD CONSTRAINT `ComplaintConfidentialIdentity_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintConfidentialIdentity` ADD CONSTRAINT `ComplaintConfidentialIdentity_tenantId_homeownerId_fkey` FOREIGN KEY (`tenantId`, `homeownerId`) REFERENCES `HomeownerProfile`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ComplaintConfidentialIdentity` ADD CONSTRAINT `ComplaintConfidentialIdentity_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintTrackingCredential` ADD CONSTRAINT `ComplaintTrackingCredential_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintTrackingCredential` ADD CONSTRAINT `ComplaintTrackingCredential_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintAttachment` ADD CONSTRAINT `ComplaintAttachment_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintAttachment` ADD CONSTRAINT `ComplaintAttachment_uploaderId_fkey` FOREIGN KEY (`uploaderId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ComplaintAttachment` ADD CONSTRAINT `ComplaintAttachment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintMessage` ADD CONSTRAINT `ComplaintMessage_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintMessage` ADD CONSTRAINT `ComplaintMessage_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ComplaintMessage` ADD CONSTRAINT `ComplaintMessage_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintStatusHistory` ADD CONSTRAINT `ComplaintStatusHistory_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintStatusHistory` ADD CONSTRAINT `ComplaintStatusHistory_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ComplaintStatusHistory` ADD CONSTRAINT `ComplaintStatusHistory_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintTimelineEvent` ADD CONSTRAINT `ComplaintTimelineEvent_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintTimelineEvent` ADD CONSTRAINT `ComplaintTimelineEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ComplaintTimelineEvent` ADD CONSTRAINT `ComplaintTimelineEvent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintAssignment` ADD CONSTRAINT `ComplaintAssignment_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintAssignment` ADD CONSTRAINT `ComplaintAssignment_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ComplaintAssignment` ADD CONSTRAINT `ComplaintAssignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ComplaintAssignment` ADD CONSTRAINT `ComplaintAssignment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintIdentityAccessGrant` ADD CONSTRAINT `ComplaintIdentityAccessGrant_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ComplaintIdentityAccessGrant` ADD CONSTRAINT `ComplaintIdentityAccessGrant_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ComplaintIdentityAccessGrant` ADD CONSTRAINT `ComplaintIdentityAccessGrant_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ComplaintIdentityAccessGrant` ADD CONSTRAINT `ComplaintIdentityAccessGrant_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `TenantModuleEntitlement` (`id`, `tenantId`, `module`, `enabled`, `createdAt`, `updatedAt`)
SELECT CONCAT('cm_disabled_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 24)), `id`, 'COMPLAINTS', false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `Tenant`
WHERE NOT EXISTS (
  SELECT 1 FROM `TenantModuleEntitlement`
  WHERE `TenantModuleEntitlement`.`tenantId` = `Tenant`.`id`
    AND `TenantModuleEntitlement`.`module` = 'COMPLAINTS'
);
