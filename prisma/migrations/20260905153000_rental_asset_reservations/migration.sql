-- Rental Asset Reservations: tenant-scoped homeowner holds on AVAILABLE rental inventory.
-- activeAssetKey is stored explicitly by reservation mutations: ACTIVE rows set it to assetId;
-- terminal rows clear it to NULL. The tenant-scoped unique index is the database-level
-- concurrency backstop while preserving cancellation/fulfillment history.

CREATE TABLE `RentalAssetReservation` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `homeownerId` VARCHAR(191) NOT NULL,
  `status` ENUM('ACTIVE','CANCELLED','FULFILLED') NOT NULL DEFAULT 'ACTIVE',
  `activeAssetKey` VARCHAR(191) NULL,
  `reservedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `cancelledAt` DATETIME(3) NULL,
  `fulfilledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RentalAssetReservation_tenantId_id_key` (`tenantId`,`id`),
  UNIQUE INDEX `RentalAssetReservation_tenantId_activeAssetKey_key` (`tenantId`,`activeAssetKey`),
  INDEX `RentalAssetReservation_tenantId_assetId_status_idx` (`tenantId`,`assetId`,`status`),
  INDEX `RentalAssetReservation_tenantId_homeownerId_status_idx` (`tenantId`,`homeownerId`,`status`),
  INDEX `RentalAssetReservation_tenantId_reservedAt_idx` (`tenantId`,`reservedAt`),
  CONSTRAINT `RentalAssetReservation_tenantId_assetId_fkey`
    FOREIGN KEY (`tenantId`,`assetId`) REFERENCES `RentalAsset`(`tenantId`,`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `RentalAssetReservation_tenantId_homeownerId_fkey`
    FOREIGN KEY (`tenantId`,`homeownerId`) REFERENCES `HomeownerProfile`(`tenantId`,`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;