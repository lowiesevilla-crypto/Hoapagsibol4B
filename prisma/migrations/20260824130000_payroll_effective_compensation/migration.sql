-- PAY-COMP-001 / PAY-COMP-002 / PAY-COMP-003
-- Introduce independent compensation basis, pay frequency, attendance policy,
-- effective dating, and immutable payslip configuration snapshots.

CREATE TABLE `EmployeeCompensation` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `compensationBasis` ENUM('MONTHLY', 'DAILY', 'HOURLY', 'FIXED_PER_PERIOD') NOT NULL,
  `payFrequency` ENUM('SEMI_MONTHLY', 'MONTHLY') NOT NULL DEFAULT 'SEMI_MONTHLY',
  `attendancePolicy` ENUM('REQUIRED', 'EXCEPTION_ONLY', 'NOT_REQUIRED') NOT NULL DEFAULT 'REQUIRED',
  `rate` DECIMAL(12, 2) NOT NULL,
  `standardWorkDays` INTEGER NOT NULL DEFAULT 26,
  `standardHoursPerDay` DECIMAL(5, 2) NOT NULL DEFAULT 8.00,
  `fixedAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `fixedDeduction` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `EmployeeCompensation_tenantId_employeeId_effectiveFrom_key`
  ON `EmployeeCompensation`(`tenantId`, `employeeId`, `effectiveFrom`);
CREATE INDEX `EmployeeCompensation_tenantId_employeeId_effectiveFrom_effectiveTo_idx`
  ON `EmployeeCompensation`(`tenantId`, `employeeId`, `effectiveFrom`, `effectiveTo`);
CREATE INDEX `EmployeeCompensation_createdById_idx` ON `EmployeeCompensation`(`createdById`);

ALTER TABLE `EmployeeCompensation`
  ADD CONSTRAINT `EmployeeCompensation_employeeId_fkey`
  FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EmployeeCompensation`
  ADD CONSTRAINT `EmployeeCompensation_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backward-compatible baseline. Existing employee master values become the
-- first effective-dated version at hire date. Legacy EmployeeProfile fields
-- remain in place during the migration window but are no longer payroll history authority.
INSERT INTO `EmployeeCompensation` (
  `tenantId`, `id`, `employeeId`, `effectiveFrom`, `effectiveTo`,
  `compensationBasis`, `payFrequency`, `attendancePolicy`, `rate`,
  `standardWorkDays`, `standardHoursPerDay`, `fixedAllowance`, `fixedDeduction`,
  `createdById`, `createdAt`, `updatedAt`
)
SELECT
  `tenantId`, CONCAT('legacy_', `id`), `id`, `hireDate`, NULL,
  CASE WHEN `salaryType` = 'DAILY' THEN 'DAILY' ELSE 'MONTHLY' END,
  'SEMI_MONTHLY', 'REQUIRED', `baseRate`,
  `standardWorkDays`, 8.00, `fixedAllowance`, `fixedDeduction`,
  NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `EmployeeProfile`;

ALTER TABLE `Payslip`
  ADD COLUMN `compensationId` VARCHAR(191) NULL,
  ADD COLUMN `compensationSnapshot` JSON NULL;
CREATE INDEX `Payslip_compensationId_idx` ON `Payslip`(`compensationId`);
ALTER TABLE `Payslip`
  ADD CONSTRAINT `Payslip_compensationId_fkey`
  FOREIGN KEY (`compensationId`) REFERENCES `EmployeeCompensation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
