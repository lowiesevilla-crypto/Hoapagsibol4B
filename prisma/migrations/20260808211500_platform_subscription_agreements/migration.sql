-- HOAHub platform subscription agreement lifecycle.
-- Existing tenant/subscription/user identifiers are retained as scalar references so the
-- agreement domain remains platform-scoped while preserving immutable historical snapshots.

CREATE TABLE `PlatformAgreementTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(80) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlatformAgreementTemplate_code_key`(`code`),
    INDEX `PlatformAgreementTemplate_active_name_idx`(`active`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PlatformAgreementTemplateVersion` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `versionLabel` VARCHAR(30) NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_LEGAL_APPROVAL', 'APPROVED', 'ACTIVE', 'RETIRED') NOT NULL DEFAULT 'DRAFT',
    `title` VARCHAR(191) NOT NULL,
    `body` LONGTEXT NOT NULL,
    `contentHash` VARCHAR(64) NOT NULL,
    `legalReviewerName` VARCHAR(191) NULL,
    `legalReviewNotes` TEXT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `effectiveAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlatformAgreementTemplateVersion_templateId_versionNumber_key`(`templateId`, `versionNumber`),
    INDEX `PlatformAgreementTemplateVersion_status_effectiveAt_idx`(`status`, `effectiveAt`),
    INDEX `PlatformAgreementTemplateVersion_templateId_status_idx`(`templateId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TenantSubscriptionAgreement` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `subscriptionId` VARCHAR(191) NOT NULL,
    `templateVersionId` VARCHAR(191) NOT NULL,
    `agreementNumber` VARCHAR(80) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'READY_FOR_SIGNATURE', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'EXPIRED', 'TERMINATED', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
    `renderedContent` LONGTEXT NOT NULL,
    `termsSnapshot` JSON NOT NULL,
    `issuerSnapshot` JSON NOT NULL,
    `tenantSnapshot` JSON NOT NULL,
    `contentHash` VARCHAR(64) NOT NULL,
    `effectiveDate` DATE NOT NULL,
    `termEndsAt` DATE NULL,
    `autoRenew` BOOLEAN NOT NULL DEFAULT true,
    `signerUserId` VARCHAR(191) NULL,
    `signerName` VARCHAR(191) NULL,
    `signerTitle` VARCHAR(191) NULL,
    `signerEmail` VARCHAR(191) NULL,
    `authorityDeclaration` TEXT NULL,
    `acceptanceText` TEXT NULL,
    `signatureText` VARCHAR(191) NULL,
    `signedAt` DATETIME(3) NULL,
    `signerIpAddress` VARCHAR(191) NULL,
    `signerUserAgent` TEXT NULL,
    `signedContentHash` VARCHAR(64) NULL,
    `sentAt` DATETIME(3) NULL,
    `viewedAt` DATETIME(3) NULL,
    `declinedAt` DATETIME(3) NULL,
    `terminatedAt` DATETIME(3) NULL,
    `terminationReason` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TenantSubscriptionAgreement_agreementNumber_key`(`agreementNumber`),
    UNIQUE INDEX `TenantSubscriptionAgreement_tenantId_id_key`(`tenantId`, `id`),
    INDEX `TenantSubscriptionAgreement_tenantId_subscriptionId_status_idx`(`tenantId`, `subscriptionId`, `status`),
    INDEX `TenantSubscriptionAgreement_tenantId_signerEmail_status_idx`(`tenantId`, `signerEmail`, `status`),
    INDEX `TenantSubscriptionAgreement_templateVersionId_status_idx`(`templateVersionId`, `status`),
    INDEX `TenantSubscriptionAgreement_signedAt_idx`(`signedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AgreementSignatureChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgreementSignatureChallenge_tenantId_agreementId_userId_expiresAt_idx`(`tenantId`, `agreementId`, `userId`, `expiresAt`),
    INDEX `AgreementSignatureChallenge_expiresAt_usedAt_idx`(`expiresAt`, `usedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AgreementAuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `eventType` ENUM('CREATED', 'READY_FOR_SIGNATURE', 'SENT', 'VIEWED', 'OTP_SENT', 'OTP_VERIFIED', 'SIGNED', 'DECLINED', 'DOWNLOADED', 'TERMINATED', 'SUPERSEDED') NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `actorEmail` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgreementAuditEvent_tenantId_agreementId_createdAt_idx`(`tenantId`, `agreementId`, `createdAt`),
    INDEX `AgreementAuditEvent_eventType_createdAt_idx`(`eventType`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PlatformAgreementTemplateVersion`
  ADD CONSTRAINT `PlatformAgreementTemplateVersion_templateId_fkey`
  FOREIGN KEY (`templateId`) REFERENCES `PlatformAgreementTemplate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TenantSubscriptionAgreement`
  ADD CONSTRAINT `TenantSubscriptionAgreement_templateVersionId_fkey`
  FOREIGN KEY (`templateVersionId`) REFERENCES `PlatformAgreementTemplateVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `AgreementSignatureChallenge`
  ADD CONSTRAINT `AgreementSignatureChallenge_agreementId_fkey`
  FOREIGN KEY (`agreementId`) REFERENCES `TenantSubscriptionAgreement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AgreementAuditEvent`
  ADD CONSTRAINT `AgreementAuditEvent_agreementId_fkey`
  FOREIGN KEY (`agreementId`) REFERENCES `TenantSubscriptionAgreement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
