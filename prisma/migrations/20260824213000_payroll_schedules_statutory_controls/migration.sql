-- PAY-TASK-011 / PAY-DED-002 / PAY-LOAN-002 / PAY-STAT-003
-- Effective-dated payroll deductions, automatic loan repayment schedules, and
-- tenant/employee statutory-applicability versions. Existing payroll behavior
-- remains enabled by default when no applicability version exists.

CREATE TABLE `PayrollDeductionSchedule` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `deductionTypeId` VARCHAR(191) NOT NULL,
  `employeeLoanId` VARCHAR(191) NULL,
  `mode` ENUM('ONE_TIME', 'RECURRING', 'UNTIL_FULLY_PAID') NOT NULL,
  `amountPerCutoff` DECIMAL(12, 2) NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `installmentLimit` INTEGER NULL,
  `status` ENUM('ACTIVE', 'PAUSED', 'COMPLETED') NOT NULL DEFAULT 'ACTIVE',
  `reason` VARCHAR(500) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `PayDedSchedule_scope_active_idx`(`tenantId`, `employeeId`, `status`, `effectiveFrom`),
  INDEX `PayDedSchedule_scope_type_idx`(`tenantId`, `deductionTypeId`),
  INDEX `PayDedSchedule_scope_loan_idx`(`tenantId`, `employeeLoanId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayrollStatutoryApplicability` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `statutoryEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `sssEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `philHealthEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `pagIbigEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `withholdingTaxEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `reason` VARCHAR(500) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `PayStatApp_scope_effective_key`(`tenantId`, `employeeId`, `effectiveFrom`),
  INDEX `PayStatApp_scope_lookup_idx`(`tenantId`, `employeeId`, `effectiveFrom`, `effectiveTo`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PayrollDeduction`
  ADD COLUMN `scheduleId` VARCHAR(191) NULL,
  ADD INDEX `PayrollDeduction_scheduleId_idx`(`scheduleId`);

ALTER TABLE `PayrollDeductionSchedule`
  ADD CONSTRAINT `PayDedSchedule_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PayDedSchedule_type_fk` FOREIGN KEY (`deductionTypeId`) REFERENCES `PayrollDeductionType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PayDedSchedule_loan_fk` FOREIGN KEY (`employeeLoanId`) REFERENCES `EmployeeLoan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PayrollStatutoryApplicability`
  ADD CONSTRAINT `PayStatApp_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PayrollDeduction`
  ADD CONSTRAINT `PayrollDeduction_schedule_fk` FOREIGN KEY (`scheduleId`) REFERENCES `PayrollDeductionSchedule`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
