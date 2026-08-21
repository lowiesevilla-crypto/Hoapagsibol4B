-- Rental Management MVP: tenant-scoped inventory, renters, agreements, receivables and collection allocation.
-- Cash remains authoritative in Collection; RentalPaymentAllocation reconciles cash to rental A/R.

CREATE UNIQUE INDEX `Collection_tenantId_id_key` ON `Collection`(`tenantId`, `id`);

CREATE TABLE `RentalAsset` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(60) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` ENUM('STALL','PARKING','SPACE','OTHER') NOT NULL,
  `location` VARCHAR(191) NULL,
  `defaultRate` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `status` ENUM('AVAILABLE','OCCUPIED','INACTIVE') NOT NULL DEFAULT 'AVAILABLE',
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RentalAsset_tenantId_id_key`(`tenantId`,`id`),
  UNIQUE INDEX `RentalAsset_tenantId_code_key`(`tenantId`,`code`),
  INDEX `RentalAsset_tenantId_status_type_idx`(`tenantId`,`status`,`type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Renter` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `homeownerId` VARCHAR(191) NULL,
  `fullName` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(50) NULL,
  `address` TEXT NULL,
  `status` ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Renter_tenantId_id_key`(`tenantId`,`id`),
  INDEX `Renter_tenantId_status_fullName_idx`(`tenantId`,`status`,`fullName`),
  INDEX `Renter_tenantId_homeownerId_idx`(`tenantId`,`homeownerId`),
  CONSTRAINT `Renter_tenantId_homeownerId_fkey` FOREIGN KEY (`tenantId`,`homeownerId`) REFERENCES `HomeownerProfile`(`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RentalAgreement` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `renterId` VARCHAR(191) NOT NULL,
  `startDate` DATE NOT NULL,
  `endDate` DATE NULL,
  `monthlyRate` DECIMAL(12,2) NOT NULL,
  `billingDay` INT NOT NULL DEFAULT 1,
  `dueDay` INT NOT NULL DEFAULT 5,
  `securityDeposit` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `status` ENUM('ACTIVE','ENDED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RentalAgreement_tenantId_id_key`(`tenantId`,`id`),
  INDEX `RentalAgreement_tenantId_assetId_status_idx`(`tenantId`,`assetId`,`status`),
  INDEX `RentalAgreement_tenantId_renterId_status_idx`(`tenantId`,`renterId`,`status`),
  INDEX `RentalAgreement_tenantId_startDate_endDate_idx`(`tenantId`,`startDate`,`endDate`),
  CONSTRAINT `RentalAgreement_tenantId_assetId_fkey` FOREIGN KEY (`tenantId`,`assetId`) REFERENCES `RentalAsset`(`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `RentalAgreement_tenantId_renterId_fkey` FOREIGN KEY (`tenantId`,`renterId`) REFERENCES `Renter`(`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RentalInvoice` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `agreementId` VARCHAR(191) NOT NULL,
  `invoiceNumber` VARCHAR(80) NOT NULL,
  `chargeType` ENUM('RENT','SECURITY_DEPOSIT','OTHER') NOT NULL DEFAULT 'RENT',
  `periodStart` DATE NOT NULL,
  `periodEnd` DATE NOT NULL,
  `dueDate` DATE NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `amountPaid` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `balance` DECIMAL(12,2) NOT NULL,
  `status` ENUM('OPEN','PARTIAL','PAID','OVERDUE','VOID') NOT NULL DEFAULT 'OPEN',
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RentalInvoice_tenantId_id_key`(`tenantId`,`id`),
  UNIQUE INDEX `RentalInvoice_tenantId_invoiceNumber_key`(`tenantId`,`invoiceNumber`),
  UNIQUE INDEX `RentalInvoice_tenantId_agreementId_chargeType_periodStart_key`(`tenantId`,`agreementId`,`chargeType`,`periodStart`),
  INDEX `RentalInvoice_tenantId_status_dueDate_idx`(`tenantId`,`status`,`dueDate`),
  INDEX `RentalInvoice_tenantId_agreementId_periodStart_idx`(`tenantId`,`agreementId`,`periodStart`),
  CONSTRAINT `RentalInvoice_tenantId_agreementId_fkey` FOREIGN KEY (`tenantId`,`agreementId`) REFERENCES `RentalAgreement`(`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RentalPaymentAllocation` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `invoiceId` VARCHAR(191) NOT NULL,
  `collectionId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RentalPaymentAllocation_tenantId_id_key`(`tenantId`,`id`),
  UNIQUE INDEX `RentalPaymentAllocation_tenantId_invoiceId_collectionId_key`(`tenantId`,`invoiceId`,`collectionId`),
  INDEX `RentalPaymentAllocation_tenantId_invoiceId_createdAt_idx`(`tenantId`,`invoiceId`,`createdAt`),
  INDEX `RentalPaymentAllocation_tenantId_collectionId_idx`(`tenantId`,`collectionId`),
  CONSTRAINT `RentalPaymentAllocation_tenantId_invoiceId_fkey` FOREIGN KEY (`tenantId`,`invoiceId`) REFERENCES `RentalInvoice`(`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `RentalPaymentAllocation_tenantId_collectionId_fkey` FOREIGN KEY (`tenantId`,`collectionId`) REFERENCES `Collection`(`tenantId`,`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;