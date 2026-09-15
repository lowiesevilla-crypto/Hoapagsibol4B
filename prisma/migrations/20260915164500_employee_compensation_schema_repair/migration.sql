-- Production schema repair for EmployeeCompensation.
--
-- The employee directory can render without this relation, while the employee
-- detail route loads compensation history. A restored/legacy production schema
-- that is missing this table therefore surfaces as a Server Component 500 only
-- when an administrator opens an employee record.
--
-- Keep this repair additive and idempotent:
--   * create the canonical table only when it is absent;
--   * never drop, delete, or overwrite existing compensation history;
--   * backfill only employees that have no compensation row at all;
--   * preserve tenant ownership from EmployeeProfile.

CREATE TABLE IF NOT EXISTS `EmployeeCompensation` (
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
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `EmployeeCompensation_tenantId_employeeId_effectiveFrom_key` (`tenantId`, `employeeId`, `effectiveFrom`),
  INDEX `EmpComp_scope_effective_idx` (`tenantId`, `employeeId`, `effectiveFrom`, `effectiveTo`),
  INDEX `EmployeeCompensation_createdById_idx` (`createdById`),
  CONSTRAINT `EmployeeCompensation_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `EmployeeCompensation_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill only profiles that currently have no compensation history. This is
-- equivalent to the original PAY-COMP migration baseline and does not replace
-- or revise any existing effective-dated payroll record.
INSERT INTO `EmployeeCompensation` (
  `tenantId`, `id`, `employeeId`, `effectiveFrom`, `effectiveTo`,
  `compensationBasis`, `payFrequency`, `attendancePolicy`, `rate`,
  `standardWorkDays`, `standardHoursPerDay`, `fixedAllowance`, `fixedDeduction`,
  `createdById`, `createdAt`, `updatedAt`
)
SELECT
  employee.`tenantId`, CONCAT('repair_', employee.`id`), employee.`id`, employee.`hireDate`, NULL,
  CASE WHEN employee.`salaryType` = 'DAILY' THEN 'DAILY' ELSE 'MONTHLY' END,
  'SEMI_MONTHLY', 'REQUIRED', employee.`baseRate`,
  employee.`standardWorkDays`, 8.00, employee.`fixedAllowance`, employee.`fixedDeduction`,
  NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `EmployeeProfile` employee
WHERE NOT EXISTS (
  SELECT 1
  FROM `EmployeeCompensation` compensation
  WHERE compensation.`tenantId` = employee.`tenantId`
    AND compensation.`employeeId` = employee.`id`
);
