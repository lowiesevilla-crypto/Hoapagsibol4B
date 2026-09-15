-- Production reconciliation for EmployeeCompensation schema drift.
--
-- PR #345 repaired a completely missing EmployeeCompensation table. A restored
-- production database can also contain the table while still missing one or more
-- columns expected by the current Prisma client. In that case CREATE TABLE IF NOT
-- EXISTS is intentionally a no-op, but employee create/edit/detail routes still
-- fail at runtime.
--
-- This migration is additive/idempotent. It never deletes compensation rows and
-- only fills values that are NULL after a missing column is added.

SET @has_table = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation'
);

-- tenantId
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'tenantId'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  "ALTER TABLE `EmployeeCompensation` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default' FIRST",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- effectiveFrom
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'effectiveFrom'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  'ALTER TABLE `EmployeeCompensation` ADD COLUMN `effectiveFrom` DATE NULL AFTER `employeeId`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- effectiveTo
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'effectiveTo'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  'ALTER TABLE `EmployeeCompensation` ADD COLUMN `effectiveTo` DATE NULL AFTER `effectiveFrom`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- compensationBasis
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'compensationBasis'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  "ALTER TABLE `EmployeeCompensation` ADD COLUMN `compensationBasis` ENUM('MONTHLY','DAILY','HOURLY','FIXED_PER_PERIOD') NULL AFTER `effectiveTo`",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payFrequency
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'payFrequency'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  "ALTER TABLE `EmployeeCompensation` ADD COLUMN `payFrequency` ENUM('SEMI_MONTHLY','MONTHLY') NOT NULL DEFAULT 'SEMI_MONTHLY' AFTER `compensationBasis`",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- attendancePolicy
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'attendancePolicy'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  "ALTER TABLE `EmployeeCompensation` ADD COLUMN `attendancePolicy` ENUM('REQUIRED','EXCEPTION_ONLY','NOT_REQUIRED') NOT NULL DEFAULT 'REQUIRED' AFTER `payFrequency`",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- rate
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'rate'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  'ALTER TABLE `EmployeeCompensation` ADD COLUMN `rate` DECIMAL(12,2) NULL AFTER `attendancePolicy`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- standardWorkDays
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'standardWorkDays'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  'ALTER TABLE `EmployeeCompensation` ADD COLUMN `standardWorkDays` INTEGER NOT NULL DEFAULT 26 AFTER `rate`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- standardHoursPerDay
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'standardHoursPerDay'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  'ALTER TABLE `EmployeeCompensation` ADD COLUMN `standardHoursPerDay` DECIMAL(5,2) NOT NULL DEFAULT 8.00 AFTER `standardWorkDays`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- fixedAllowance
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'fixedAllowance'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  'ALTER TABLE `EmployeeCompensation` ADD COLUMN `fixedAllowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER `standardHoursPerDay`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- fixedDeduction
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'fixedDeduction'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  'ALTER TABLE `EmployeeCompensation` ADD COLUMN `fixedDeduction` DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER `fixedAllowance`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- createdById
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'createdById'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  'ALTER TABLE `EmployeeCompensation` ADD COLUMN `createdById` VARCHAR(191) NULL AFTER `fixedDeduction`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- createdAt
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'createdAt'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  'ALTER TABLE `EmployeeCompensation` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER `createdById`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- updatedAt
SET @has_column = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EmployeeCompensation' AND COLUMN_NAME = 'updatedAt'
);
SET @sql = IF(@has_table > 0 AND @has_column = 0,
  'ALTER TABLE `EmployeeCompensation` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER `createdAt`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rehydrate only missing values from the owning employee profile. Existing
-- compensation values remain authoritative and are not overwritten.
UPDATE `EmployeeCompensation` compensation
JOIN `EmployeeProfile` employee ON employee.`id` = compensation.`employeeId`
SET
  compensation.`tenantId` = COALESCE(NULLIF(compensation.`tenantId`, ''), employee.`tenantId`),
  compensation.`effectiveFrom` = COALESCE(compensation.`effectiveFrom`, employee.`hireDate`),
  compensation.`compensationBasis` = COALESCE(
    compensation.`compensationBasis`,
    CASE WHEN employee.`salaryType` = 'DAILY' THEN 'DAILY' ELSE 'MONTHLY' END
  ),
  compensation.`rate` = COALESCE(compensation.`rate`, employee.`baseRate`),
  compensation.`standardWorkDays` = COALESCE(compensation.`standardWorkDays`, employee.`standardWorkDays`),
  compensation.`fixedAllowance` = COALESCE(compensation.`fixedAllowance`, employee.`fixedAllowance`),
  compensation.`fixedDeduction` = COALESCE(compensation.`fixedDeduction`, employee.`fixedDeduction`)
WHERE compensation.`effectiveFrom` IS NULL
   OR compensation.`compensationBasis` IS NULL
   OR compensation.`rate` IS NULL
   OR compensation.`tenantId` IS NULL
   OR compensation.`tenantId` = '';

-- Tighten the three columns that were intentionally added nullable above only
-- after the backfill has supplied deterministic legacy values.
ALTER TABLE `EmployeeCompensation`
  MODIFY COLUMN `effectiveFrom` DATE NOT NULL,
  MODIFY COLUMN `compensationBasis` ENUM('MONTHLY','DAILY','HOURLY','FIXED_PER_PERIOD') NOT NULL,
  MODIFY COLUMN `rate` DECIMAL(12,2) NOT NULL;
