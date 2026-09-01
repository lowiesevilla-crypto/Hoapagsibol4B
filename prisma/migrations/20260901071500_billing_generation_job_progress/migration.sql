CREATE TABLE `BillingGenerationJob` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(64) NOT NULL,
    `idempotencyKeyHash` VARCHAR(64) NOT NULL,
    `coverageYear` INTEGER NOT NULL,
    `coverageMonth` INTEGER NOT NULL,
    `scope` VARCHAR(20) NOT NULL,
    `targetFilter` JSON NULL,
    `total` INTEGER NOT NULL DEFAULT 0,
    `completed` INTEGER NOT NULL DEFAULT 0,
    `succeeded` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `leaseToken` VARCHAR(64) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `retryOfJobId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NULL,
    `heartbeatAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BillingGenerationJob_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `BillingGenerationJob_tenantId_reference_key`(`tenantId`, `reference`),
    UNIQUE INDEX `BillingGenerationJob_tenantId_idempotencyKeyHash_key`(`tenantId`, `idempotencyKeyHash`),
    INDEX `BillingGenerationJob_tenantId_status_updatedAt_idx`(`tenantId`, `status`, `updatedAt`),
    INDEX `BillingGenerationJob_tenantId_coverageYear_coverageMonth_idx`(`tenantId`, `coverageYear`, `coverageMonth`),
    INDEX `BillingGenerationJob_tenantId_retryOfJobId_idx`(`tenantId`, `retryOfJobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BillingGenerationJobItem` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `homeownerId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `message` TEXT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BillingGenerationJobItem_jobId_homeownerId_key`(`jobId`, `homeownerId`),
    INDEX `BillingGenerationJobItem_tenantId_jobId_status_idx`(`tenantId`, `jobId`, `status`),
    INDEX `BillingGenerationJobItem_tenantId_homeownerId_idx`(`tenantId`, `homeownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BillingGenerationJobItem`
    ADD CONSTRAINT `BillingGenerationJobItem_tenantId_jobId_fkey`
    FOREIGN KEY (`tenantId`, `jobId`) REFERENCES `BillingGenerationJob`(`tenantId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
