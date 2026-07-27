-- Phase 1: introduce the canonical homeowner account number without rewriting
-- existing profiles. Backfill is performed by an idempotent application script.
ALTER TABLE `HomeownerProfile` ADD COLUMN `accountNumber` VARCHAR(11) NULL;

CREATE UNIQUE INDEX `HomeownerProfile_accountNumber_key` ON `HomeownerProfile`(`accountNumber`);

CREATE TABLE `HomeownerAccountNumberReservation` (
    `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
    `id` VARCHAR(191) NOT NULL,
    `accountNumber` VARCHAR(11) NOT NULL,
    `homeownerId` VARCHAR(191) NULL,
    `reason` VARCHAR(191) NOT NULL DEFAULT 'ASSIGNED',
    `reservedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HomeownerAccountNumberReservation_accountNumber_key`(`accountNumber`),
    UNIQUE INDEX `HomeownerAccountNumberReservation_tenantId_id_key`(`tenantId`, `id`),
    INDEX `HomeownerAccountNumberReservation_tenantId_homeownerId_idx`(`tenantId`, `homeownerId`),
    INDEX `HomeownerAccountNumberReservation_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
