-- Create tenant-scoped role assignments for employees and tenant admins.
CREATE TABLE `UserRoleAssignment` (
  `tenantId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `role` ENUM('SUPER_ADMIN','PLATFORM_ADMIN','HOA_ADMIN','BILLING_MANAGER','PAYROLL_MANAGER','STAFF','SYSTEM_ADMIN','ADMIN','HOMEOWNER','EMPLOYEE') NOT NULL,
  `assignedBy` VARCHAR(191) NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `active` BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (`tenantId`, `userId`, `role`),
  INDEX `UserRoleAssignment_tenantId_active_role_idx` (`tenantId`, `active`, `role`),
  INDEX `UserRoleAssignment_userId_active_idx` (`userId`, `active`),
  CONSTRAINT `UserRoleAssignment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserRoleAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserRoleAssignment_assignedBy_fkey` FOREIGN KEY (`assignedBy`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
