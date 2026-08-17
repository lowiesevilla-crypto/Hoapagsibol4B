-- HOAHub Complaint-to-Grievance Foundation Phase 1
-- BRD: docs/complaints/HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md
-- Requirements: ANM, SUB, VER, GRV, COM, DDL, DATA, SEC-GRV.
--
-- This migration is intentionally additive. Application rollback must leave these
-- tables/columns in place so grievance/audit history is not destroyed.

CREATE TABLE `GrievanceSetting` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `foundationEnabled` BOOLEAN NOT NULL DEFAULT true,
  `anonymousMessagingEnabled` BOOLEAN NOT NULL DEFAULT true,
  `anonymousSessionMinutes` INTEGER NOT NULL DEFAULT 30,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GrievanceSetting_tenantId_key`(`tenantId`),
  UNIQUE INDEX `GrievanceSetting_tenantId_id_key`(`tenantId`, `id`),
  INDEX `GrievanceSetting_updatedById_idx`(`updatedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintAnonymousSession` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `lastSeenAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ComplaintAnonymousSession_tokenHash_key`(`tokenHash`),
  UNIQUE INDEX `ComplaintAnonymousSession_tenantId_id_key`(`tenantId`, `id`),
  INDEX `ComplaintAnonymousSession_tenantId_complaintId_idx`(`tenantId`, `complaintId`),
  INDEX `ComplaintAnonymousSession_expiresAt_revokedAt_idx`(`expiresAt`, `revokedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ComplaintMessage`
  ADD COLUMN `senderType` ENUM('COMPLAINANT', 'STAFF', 'SYSTEM') NULL,
  ADD COLUMN `channel` ENUM('HOMEOWNER_PORTAL', 'ANONYMOUS_TRACKER', 'ADMIN', 'SYSTEM') NULL,
  ADD COLUMN `clientMessageId` VARCHAR(191) NULL,
  ADD COLUMN `anonymousSessionId` VARCHAR(191) NULL;

UPDATE `ComplaintMessage` m
INNER JOIN `Complaint` c ON c.`tenantId` = m.`tenantId` AND c.`id` = m.`complaintId`
LEFT JOIN `User` u ON u.`id` = m.`authorId`
SET
  m.`senderType` = CASE
    WHEN m.`authorId` IS NULL OR u.`role` = 'HOMEOWNER' THEN 'COMPLAINANT'
    ELSE 'STAFF'
  END,
  m.`channel` = CASE
    WHEN c.`privacyMode` = 'ANONYMOUS' AND m.`authorId` IS NULL THEN 'ANONYMOUS_TRACKER'
    WHEN m.`authorId` IS NULL OR u.`role` = 'HOMEOWNER' THEN 'HOMEOWNER_PORTAL'
    ELSE 'ADMIN'
  END;

ALTER TABLE `ComplaintMessage`
  MODIFY `senderType` ENUM('COMPLAINANT', 'STAFF', 'SYSTEM') NOT NULL DEFAULT 'STAFF',
  MODIFY `channel` ENUM('HOMEOWNER_PORTAL', 'ANONYMOUS_TRACKER', 'ADMIN', 'SYSTEM') NOT NULL DEFAULT 'ADMIN',
  ADD UNIQUE INDEX `ComplaintMessage_anon_idempotency_key`(`tenantId`, `complaintId`, `anonymousSessionId`, `clientMessageId`),
  ADD INDEX `ComplaintMessage_anon_cursor_idx`(`tenantId`, `complaintId`, `visibility`, `createdAt`, `id`),
  ADD INDEX `ComplaintMessage_anonymousSessionId_idx`(`anonymousSessionId`);

CREATE TABLE `ComplaintSubject` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `subjectType` ENUM('HOMEOWNER', 'PROPERTY', 'VEHICLE', 'COMMON_AREA', 'UNKNOWN') NOT NULL,
  `homeownerId` VARCHAR(191) NULL,
  `vehicleId` VARCHAR(191) NULL,
  `displayLabel` VARCHAR(191) NULL,
  `phaseSnapshot` VARCHAR(191) NULL,
  `blockSnapshot` VARCHAR(191) NULL,
  `lotSnapshot` VARCHAR(191) NULL,
  `addressSnapshot` VARCHAR(500) NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ComplaintSubject_tenantId_id_key`(`tenantId`, `id`),
  INDEX `ComplaintSubject_tenantId_complaintId_idx`(`tenantId`, `complaintId`),
  INDEX `ComplaintSubject_tenantId_homeownerId_idx`(`tenantId`, `homeownerId`),
  INDEX `ComplaintSubject_tenantId_vehicleId_idx`(`tenantId`, `vehicleId`),
  INDEX `ComplaintSubject_createdById_idx`(`createdById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintVerificationPolicy` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `policyKey` VARCHAR(120) NOT NULL,
  `categoryId` VARCHAR(191) NULL,
  `privacyMode` ENUM('NAMED', 'CONFIDENTIAL', 'ANONYMOUS') NULL,
  `verificationRequired` BOOLEAN NOT NULL DEFAULT true,
  `blocksEnforcement` BOOLEAN NOT NULL DEFAULT true,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdById` VARCHAR(191) NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ComplaintVerificationPolicy_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `ComplaintVerificationPolicy_tenantId_policyKey_key`(`tenantId`, `policyKey`),
  INDEX `ComplaintVerificationPolicy_match_idx`(`tenantId`, `categoryId`, `privacyMode`, `active`),
  INDEX `ComplaintVerificationPolicy_createdById_idx`(`createdById`),
  INDEX `ComplaintVerificationPolicy_updatedById_idx`(`updatedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintVerification` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `required` BOOLEAN NOT NULL DEFAULT false,
  `blocksEnforcement` BOOLEAN NOT NULL DEFAULT false,
  `status` ENUM('NOT_REQUIRED', 'PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED', 'INSUFFICIENT') NOT NULL DEFAULT 'NOT_REQUIRED',
  `verificationType` ENUM('SITE_INSPECTION', 'SECURITY_REPORT', 'CCTV_REVIEW', 'STAFF_OBSERVATION', 'DOCUMENT_REVIEW', 'MULTIPLE_INDEPENDENT_REPORTS', 'OTHER') NULL,
  `findings` TEXT NULL,
  `verifiedById` VARCHAR(191) NULL,
  `verifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ComplaintVerification_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `ComplaintVerification_tenantId_complaintId_key`(`tenantId`, `complaintId`),
  INDEX `ComplaintVerification_tenantId_status_idx`(`tenantId`, `status`),
  INDEX `ComplaintVerification_verifiedById_idx`(`verifiedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GrievanceCase` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `status` ENUM('ASSESSMENT', 'VERIFICATION_REQUIRED', 'VERIFIED', 'READY_FOR_FORMAL_PROCESS', 'CLOSED_NO_ACTION', 'CLOSED_UNSUBSTANTIATED') NOT NULL DEFAULT 'ASSESSMENT',
  `boardReviewRequired` BOOLEAN NOT NULL DEFAULT false,
  `operationalSlaPausedAt` DATETIME(3) NULL,
  `operationalSlaPauseReason` TEXT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `closedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GrievanceCase_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `GrievanceCase_tenantId_complaintId_key`(`tenantId`, `complaintId`),
  INDEX `GrievanceCase_tenantId_status_updatedAt_idx`(`tenantId`, `status`, `updatedAt`),
  INDEX `GrievanceCase_createdById_idx`(`createdById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GrievanceCommitteeMembership` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `position` ENUM('CHAIR', 'MEMBER', 'SECRETARY', 'MEDIATOR') NOT NULL,
  `permissions` JSON NULL,
  `startsAt` DATETIME(3) NOT NULL,
  `endsAt` DATETIME(3) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `appointedById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GrievanceCommitteeMembership_tenantId_id_key`(`tenantId`, `id`),
  INDEX `GrievanceCommitteeMembership_active_idx`(`tenantId`, `userId`, `active`, `startsAt`, `endsAt`),
  INDEX `GrievanceCommitteeMembership_position_idx`(`tenantId`, `position`, `active`),
  INDEX `GrievanceCommitteeMembership_appointedById_idx`(`appointedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GrievanceDeadline` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `grievanceCaseId` VARCHAR(191) NOT NULL,
  `deadlineType` ENUM('RESPONDENT_RESPONSE', 'MEDIATION_SCHEDULING', 'HEARING_NOTICE', 'RECONSIDERATION', 'APPEAL', 'CORRECTIVE_ACTION') NOT NULL,
  `status` ENUM('OPEN', 'PAUSED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
  `startsAt` DATETIME(3) NOT NULL,
  `dueAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  `pausedAt` DATETIME(3) NULL,
  `pauseReason` TEXT NULL,
  `policySource` TEXT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GrievanceDeadline_tenantId_id_key`(`tenantId`, `id`),
  INDEX `GrievanceDeadline_case_status_due_idx`(`tenantId`, `grievanceCaseId`, `status`, `dueAt`),
  INDEX `GrievanceDeadline_createdById_idx`(`createdById`),
  INDEX `GrievanceDeadline_updatedById_idx`(`updatedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ComplaintGrievanceActivity` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `complaintId` VARCHAR(191) NOT NULL,
  `grievanceCaseId` VARCHAR(191) NULL,
  `actorId` VARCHAR(191) NULL,
  `eventType` VARCHAR(80) NOT NULL,
  `message` TEXT NOT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ComplaintGrievanceActivity_tenantId_id_key`(`tenantId`, `id`),
  INDEX `ComplaintGrievanceActivity_complaint_created_idx`(`tenantId`, `complaintId`, `createdAt`),
  INDEX `ComplaintGrievanceActivity_grievance_created_idx`(`tenantId`, `grievanceCaseId`, `createdAt`),
  INDEX `ComplaintGrievanceActivity_actorId_idx`(`actorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GrievanceSetting`
  ADD CONSTRAINT `GrievanceSetting_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `GrievanceSetting_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ComplaintAnonymousSession`
  ADD CONSTRAINT `ComplaintAnonymousSession_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- anonymousSessionId is nullable while ComplaintMessage.tenantId is not. MySQL cannot
-- apply SET NULL to a composite (tenantId, anonymousSessionId) relationship because it
-- would have to null tenantId as well. Session IDs are globally unique primary keys, so
-- reference the session id directly and keep tenant/complaint binding enforced in service
-- predicates and the idempotency index.
ALTER TABLE `ComplaintMessage`
  ADD CONSTRAINT `ComplaintMessage_anonymousSessionId_fkey` FOREIGN KEY (`anonymousSessionId`) REFERENCES `ComplaintAnonymousSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ComplaintSubject`
  ADD CONSTRAINT `ComplaintSubject_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ComplaintSubject_tenantId_homeownerId_fkey` FOREIGN KEY (`tenantId`, `homeownerId`) REFERENCES `HomeownerProfile`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ComplaintSubject_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ComplaintVerificationPolicy`
  ADD CONSTRAINT `ComplaintVerificationPolicy_tenantId_categoryId_fkey` FOREIGN KEY (`tenantId`, `categoryId`) REFERENCES `ComplaintCategory`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ComplaintVerificationPolicy_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `ComplaintVerificationPolicy_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ComplaintVerification`
  ADD CONSTRAINT `ComplaintVerification_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ComplaintVerification_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `GrievanceCase`
  ADD CONSTRAINT `GrievanceCase_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `GrievanceCase_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `GrievanceCommitteeMembership`
  ADD CONSTRAINT `GrievanceCommitteeMembership_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `GrievanceCommitteeMembership_tenantId_userId_fkey` FOREIGN KEY (`tenantId`, `userId`) REFERENCES `User`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `GrievanceCommitteeMembership_appointedById_fkey` FOREIGN KEY (`appointedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `GrievanceDeadline`
  ADD CONSTRAINT `GrievanceDeadline_tenantId_grievanceCaseId_fkey` FOREIGN KEY (`tenantId`, `grievanceCaseId`) REFERENCES `GrievanceCase`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `GrievanceDeadline_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `GrievanceDeadline_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ComplaintGrievanceActivity`
  ADD CONSTRAINT `ComplaintGrievanceActivity_tenantId_complaintId_fkey` FOREIGN KEY (`tenantId`, `complaintId`) REFERENCES `Complaint`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ComplaintGrievanceActivity_tenantId_grievanceCaseId_fkey` FOREIGN KEY (`tenantId`, `grievanceCaseId`) REFERENCES `GrievanceCase`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ComplaintGrievanceActivity_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;