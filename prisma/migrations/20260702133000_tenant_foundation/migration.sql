-- Phase 2: create the independent tenant master only.
-- Existing HOA records remain unassigned until the controlled Phase 3 migration.
CREATE TABLE `Tenant` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `shortName` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `logoUrl` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `contactNumber` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `secRegistrationNumber` VARCHAR(191) NULL,
    `tinNumber` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `subscriptionPlan` VARCHAR(191) NOT NULL DEFAULT 'STANDARD',
    `subscriptionStatus` ENUM('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED') NOT NULL DEFAULT 'TRIAL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tenant_slug_key`(`slug`),
    INDEX `Tenant_name_idx`(`name`),
    INDEX `Tenant_status_subscriptionStatus_idx`(`status`, `subscriptionStatus`),
    INDEX `Tenant_subscriptionPlan_subscriptionStatus_idx`(`subscriptionPlan`, `subscriptionStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
