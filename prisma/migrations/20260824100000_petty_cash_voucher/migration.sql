-- HOAHub Petty Cash Voucher module.
-- Commercial enablement is stored in the existing generic feature entitlement tables;
-- this migration adds only the tenant-owned voucher ledger and line-item evidence.

CREATE TABLE `PettyCashVoucher` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `voucherNumber` VARCHAR(80) NOT NULL,
  `transactionDate` DATE NOT NULL,
  `payeeType` VARCHAR(30) NOT NULL,
  `payeeEntityId` VARCHAR(191) NULL,
  `payeeName` VARCHAR(191) NOT NULL,
  `address` TEXT NULL,
  `approvedByType` VARCHAR(20) NOT NULL,
  `approvedById` VARCHAR(191) NULL,
  `approvedByName` VARCHAR(191) NOT NULL,
  `approvedByTitle` VARCHAR(191) NULL,
  `receivedBy` VARCHAR(191) NOT NULL,
  `totalAmount` DECIMAL(12, 2) NOT NULL,
  `employeeId` VARCHAR(191) NULL,
  `employeeLoanId` VARCHAR(191) NULL,
  `deductionPerCutoff` DECIMAL(12, 2) NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'POSTED',
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `PettyCashVoucher_tenant_voucher_key` (`tenantId`, `voucherNumber`),
  INDEX `PettyCashVoucher_tenant_date_idx` (`tenantId`, `transactionDate`),
  INDEX `PettyCashVoucher_tenant_payee_idx` (`tenantId`, `payeeType`, `payeeEntityId`),
  INDEX `PettyCashVoucher_employee_idx` (`tenantId`, `employeeId`),
  INDEX `PettyCashVoucher_loan_idx` (`tenantId`, `employeeLoanId`),
  INDEX `PettyCashVoucher_creator_idx` (`createdById`),

  CONSTRAINT `PettyCashVoucher_tenant_fk` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PettyCashVoucher_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PettyCashVoucher_loan_fk` FOREIGN KEY (`employeeLoanId`) REFERENCES `EmployeeLoan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PettyCashVoucher_creator_fk` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PettyCashVoucherItem` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `voucherId` VARCHAR(191) NOT NULL,
  `expenseCategoryId` VARCHAR(191) NOT NULL,
  `particular` VARCHAR(255) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `expenseId` VARCHAR(191) NOT NULL,
  `displayOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `PettyCashVoucherItem_tenant_voucher_idx` (`tenantId`, `voucherId`, `displayOrder`),
  INDEX `PettyCashVoucherItem_category_idx` (`tenantId`, `expenseCategoryId`),
  INDEX `PettyCashVoucherItem_expense_idx` (`expenseId`),

  CONSTRAINT `PettyCashVoucherItem_voucher_fk` FOREIGN KEY (`voucherId`) REFERENCES `PettyCashVoucher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PettyCashVoucherItem_category_fk` FOREIGN KEY (`expenseCategoryId`) REFERENCES `ExpenseCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PettyCashVoucherItem_expense_fk` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
