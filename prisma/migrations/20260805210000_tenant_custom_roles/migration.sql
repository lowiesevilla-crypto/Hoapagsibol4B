CREATE TABLE `TenantCustomRole` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `key` VARCHAR(80) NOT NULL,
  `description` VARCHAR(500) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdById` VARCHAR(191) NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `TenantCustomRole_tenantId_name_key`(`tenantId`, `name`),
  UNIQUE INDEX `TenantCustomRole_tenantId_key_key`(`tenantId`, `key`),
  INDEX `TenantCustomRole_tenantId_active_idx`(`tenantId`, `active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TenantCustomRolePermission` (
  `tenantId` VARCHAR(191) NOT NULL,
  `roleId` VARCHAR(191) NOT NULL,
  `permission` VARCHAR(191) NOT NULL,

  INDEX `TenantCustomRolePermission_tenantId_permission_idx`(`tenantId`, `permission`),
  PRIMARY KEY (`roleId`, `permission`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserTenantCustomRoleAssignment` (
  `tenantId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `roleId` VARCHAR(191) NOT NULL,
  `assignedBy` VARCHAR(191) NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `active` BOOLEAN NOT NULL DEFAULT true,

  INDEX `UserTenantCustomRoleAssignment_tenantId_active_roleId_idx`(`tenantId`, `active`, `roleId`),
  INDEX `UserTenantCustomRoleAssignment_userId_active_idx`(`userId`, `active`),
  PRIMARY KEY (`tenantId`, `userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TenantCustomRole`
  ADD CONSTRAINT `TenantCustomRole_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TenantCustomRole`
  ADD CONSTRAINT `TenantCustomRole_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `TenantCustomRole`
  ADD CONSTRAINT `TenantCustomRole_updatedById_fkey`
  FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `TenantCustomRolePermission`
  ADD CONSTRAINT `TenantCustomRolePermission_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TenantCustomRolePermission`
  ADD CONSTRAINT `TenantCustomRolePermission_roleId_fkey`
  FOREIGN KEY (`roleId`) REFERENCES `TenantCustomRole`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserTenantCustomRoleAssignment`
  ADD CONSTRAINT `UserTenantCustomRoleAssignment_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserTenantCustomRoleAssignment`
  ADD CONSTRAINT `UserTenantCustomRoleAssignment_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserTenantCustomRoleAssignment`
  ADD CONSTRAINT `UserTenantCustomRoleAssignment_roleId_fkey`
  FOREIGN KEY (`roleId`) REFERENCES `TenantCustomRole`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserTenantCustomRoleAssignment`
  ADD CONSTRAINT `UserTenantCustomRoleAssignment_assignedBy_fkey`
  FOREIGN KEY (`assignedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
