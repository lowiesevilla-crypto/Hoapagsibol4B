-- CreateTable
CREATE TABLE `HomeownerActivationBulkJob` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `initiatedById` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `selectionMode` ENUM('SELECTED', 'FILTERED') NOT NULL,
    `filterSnapshot` JSON NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `totalTargets` INTEGER NOT NULL DEFAULT 0,
    `eligibleCount` INTEGER NOT NULL DEFAULT 0,
    `queuedCount` INTEGER NOT NULL DEFAULT 0,
    `processedCount` INTEGER NOT NULL DEFAULT 0,
    `acceptedCount` INTEGER NOT NULL DEFAULT 0,
    `skippedCount` INTEGER NOT NULL DEFAULT 0,
    `failedCount` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `leaseOwner` VARCHAR(191) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HomeownerActivationBulkJob_tenantId_idempotencyKey_key`(`tenantId`, `idempotencyKey`),
    INDEX `HomeownerActivationBulkJob_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `HomeownerActivationBulkJob_status_leaseExpiresAt_idx`(`status`, `leaseExpiresAt`),
    INDEX `HomeownerActivationBulkJob_tenantId_initiatedById_createdAt_idx`(`tenantId`, `initiatedById`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HomeownerActivationBulkItem` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `homeownerId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'ACCEPTED', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `notificationId` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `attemptedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HomeownerActivationBulkItem_tenantId_jobId_homeownerId_key`(`tenantId`, `jobId`, `homeownerId`),
    INDEX `HomeownerActivationBulkItem_tenantId_jobId_status_createdAt_idx`(`tenantId`, `jobId`, `status`, `createdAt`),
    INDEX `HomeownerActivationBulkItem_tenantId_homeownerId_status_idx`(`tenantId`, `homeownerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
