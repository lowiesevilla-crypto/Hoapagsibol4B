-- Add durable homeowner activation, verification, passkey, and revocable session support.

CREATE TABLE `HomeownerActivationCredential` (
    `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `credentialHash` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `lastAttemptAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HomeownerActivationCredential_credentialHash_key`(`credentialHash`),
    INDEX `HomeownerActivationCredential_tenantId_userId_expiresAt_idx`(`tenantId`, `userId`, `expiresAt`),
    INDEX `HomeownerActivationCredential_tenantId_createdById_idx`(`tenantId`, `createdById`),
    INDEX `HomeownerActivationCredential_expiresAt_usedAt_revokedAt_idx`(`expiresAt`, `usedAt`, `revokedAt`),
    INDEX `HomeownerActivationCredential_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `HomeownerEmailVerificationToken` (
    `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `HomeownerEmailVerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `HomeownerEmailVerificationToken_tenantId_userId_expiresAt_idx`(`tenantId`, `userId`, `expiresAt`),
    INDEX `HomeownerEmailVerificationToken_expiresAt_usedAt_idx`(`expiresAt`, `usedAt`),
    INDEX `HomeownerEmailVerificationToken_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserPasskeyCredential` (
    `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `credentialId` VARCHAR(512) NOT NULL,
    `publicKey` TEXT NOT NULL,
    `counter` BIGINT NOT NULL DEFAULT 0,
    `transports` JSON NULL,
    `deviceName` VARCHAR(120) NULL,
    `backedUp` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `UserPasskeyCredential_credentialId_key`(`credentialId`),
    INDEX `UserPasskeyCredential_tenantId_userId_idx`(`tenantId`, `userId`),
    INDEX `UserPasskeyCredential_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserPasskeyChallenge` (
    `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `challengeHash` VARCHAR(191) NOT NULL,
    `type` ENUM('REGISTRATION', 'AUTHENTICATION') NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserPasskeyChallenge_challengeHash_key`(`challengeHash`),
    INDEX `UserPasskeyChallenge_tenantId_userId_type_expiresAt_idx`(`tenantId`, `userId`, `type`, `expiresAt`),
    INDEX `UserPasskeyChallenge_expiresAt_usedAt_idx`(`expiresAt`, `usedAt`),
    INDEX `UserPasskeyChallenge_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserSession` (
    `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `userAgentHash` VARCHAR(191) NULL,
    `ipHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NULL,

    UNIQUE INDEX `UserSession_tokenHash_key`(`tokenHash`),
    INDEX `UserSession_tenantId_userId_expiresAt_idx`(`tenantId`, `userId`, `expiresAt`),
    INDEX `UserSession_expiresAt_revokedAt_idx`(`expiresAt`, `revokedAt`),
    INDEX `UserSession_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `HomeownerProfile`
    ADD COLUMN `activationStatus` ENUM('PENDING_ACTIVATION', 'ACTIVE', 'DISABLED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `emailStatus` ENUM('UNVERIFIED', 'VERIFIED') NOT NULL DEFAULT 'UNVERIFIED',
    ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `mobileConfirmedAt` DATETIME(3) NULL,
    ADD COLUMN `activationSentAt` DATETIME(3) NULL,
    ADD COLUMN `activatedAt` DATETIME(3) NULL;

ALTER TABLE `HomeownerActivationCredential` ADD CONSTRAINT `HomeownerActivationCredential_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `HomeownerActivationCredential` ADD CONSTRAINT `HomeownerActivationCredential_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `HomeownerEmailVerificationToken` ADD CONSTRAINT `HomeownerEmailVerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserPasskeyCredential` ADD CONSTRAINT `UserPasskeyCredential_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserPasskeyChallenge` ADD CONSTRAINT `UserPasskeyChallenge_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserSession` ADD CONSTRAINT `UserSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
