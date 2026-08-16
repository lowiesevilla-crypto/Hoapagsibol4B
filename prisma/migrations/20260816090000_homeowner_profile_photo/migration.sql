-- Tenant-scoped homeowner profile photos.
-- Photo metadata is kept separate from the core User/HomeownerProfile tables so the upload feature
-- can be rolled back independently without changing authentication or homeowner master data.

CREATE TABLE `HomeownerProfilePhoto` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `storedName` VARCHAR(191) NOT NULL,
  `contentType` VARCHAR(100) NOT NULL,
  `size` INT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `HomeownerProfilePhoto_tenantId_userId_key` (`tenantId`, `userId`),
  KEY `HomeownerProfilePhoto_tenantId_idx` (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
