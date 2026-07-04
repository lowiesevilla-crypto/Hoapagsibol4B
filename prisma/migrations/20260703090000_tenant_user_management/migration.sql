ALTER TABLE `User`
  ADD COLUMN `username` VARCHAR(191) NULL,
  ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
  ADD UNIQUE INDEX `User_username_key`(`username`),
  ADD INDEX `User_tenantId_active_role_idx`(`tenantId`, `active`, `role`);
