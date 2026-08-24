-- PAY-TASK-005: expanded payroll lifecycle and immutable calculation revisions.

ALTER TABLE `PayrollPeriod`
  MODIFY `status` ENUM('DRAFT', 'CALCULATED', 'FINALIZED', 'POSTING', 'POSTED', 'POST_FAILED', 'PAID') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `pendingRevisionType` ENUM('INITIAL', 'CORRECTION', 'REVERSAL', 'DELTA') NULL,
  ADD COLUMN `pendingRevisionReason` VARCHAR(500) NULL,
  ADD COLUMN `pendingParentRevisionId` VARCHAR(191) NULL;

-- Existing draft periods that already contain calculated payslips are calculated,
-- not empty drafts. This preserves their behavior while making the state explicit.
UPDATE `PayrollPeriod` AS `period`
SET `status` = 'CALCULATED'
WHERE `period`.`status` = 'DRAFT'
  AND EXISTS (
    SELECT 1
    FROM `Payslip` AS `slip`
    WHERE `slip`.`payrollId` = `period`.`id`
  );

CREATE TABLE `PayrollCalculationRevision` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `payrollId` VARCHAR(191) NOT NULL,
  `revisionNumber` INTEGER NOT NULL,
  `revisionType` ENUM('INITIAL', 'CORRECTION', 'REVERSAL', 'DELTA') NOT NULL,
  `lifecycleStatus` ENUM('DRAFT', 'CALCULATED', 'FINALIZED', 'POSTING', 'POSTED', 'POST_FAILED', 'PAID') NOT NULL,
  `parentRevisionId` VARCHAR(191) NULL,
  `reversedRevisionId` VARCHAR(191) NULL,
  `reason` VARCHAR(500) NULL,
  `periodSnapshot` JSON NOT NULL,
  `deductionSnapshot` JSON NOT NULL,
  `adjustmentSnapshot` JSON NOT NULL,
  `overtimeSnapshot` JSON NOT NULL,
  `totalsSnapshot` JSON NOT NULL,
  `deltaSnapshot` JSON NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `PayrollCalcRev_payroll_revision_key`(`payrollId`, `revisionNumber`),
  UNIQUE INDEX `PayrollCalculationRevision_reversedRevisionId_key`(`reversedRevisionId`),
  INDEX `PayrollCalcRev_scope_idx`(`tenantId`, `payrollId`, `createdAt`),
  INDEX `PayrollCalcRev_parent_idx`(`parentRevisionId`),
  INDEX `PayrollCalcRev_creator_idx`(`createdById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayrollCalculationRevisionPayslip` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `revisionId` VARCHAR(191) NOT NULL,
  `payslipId` VARCHAR(191) NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `snapshot` JSON NOT NULL,
  `grossPay` DECIMAL(12, 2) NOT NULL,
  `deduction` DECIMAL(12, 2) NOT NULL,
  `netPay` DECIMAL(12, 2) NOT NULL,
  `grossPayDelta` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `deductionDelta` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `netPayDelta` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `PayrollCalcRevSlip_revision_employee_key`(`revisionId`, `employeeId`),
  INDEX `PayrollCalcRevSlip_scope_idx`(`tenantId`, `employeeId`),
  INDEX `PayrollCalcRevSlip_payslip_idx`(`payslipId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed immutable revision-1 evidence for every historical calculated/finalized/paid
-- period. The deterministic IDs make the migration retry-safe at the SQL level.
INSERT INTO `PayrollCalculationRevision` (
  `tenantId`, `id`, `payrollId`, `revisionNumber`, `revisionType`, `lifecycleStatus`,
  `reason`, `periodSnapshot`, `deductionSnapshot`, `adjustmentSnapshot`,
  `overtimeSnapshot`, `totalsSnapshot`, `deltaSnapshot`, `createdById`, `createdAt`
)
SELECT
  `period`.`tenantId`,
  CONCAT('prv_', LEFT(SHA2(CONCAT(`period`.`tenantId`, ':', `period`.`id`, ':1'), 256), 28)),
  `period`.`id`,
  1,
  'INITIAL',
  `period`.`status`,
  'Legacy payroll evidence backfilled by PAY-TASK-005 migration.',
  JSON_OBJECT(
    'id', `period`.`id`,
    'tenantId', `period`.`tenantId`,
    'startDate', DATE_FORMAT(`period`.`startDate`, '%Y-%m-%d'),
    'endDate', DATE_FORMAT(`period`.`endDate`, '%Y-%m-%d'),
    'payDate', DATE_FORMAT(`period`.`payDate`, '%Y-%m-%d'),
    'status', `period`.`status`,
    'source', 'LEGACY_BACKFILL'
  ),
  COALESCE((
    SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'id', `deduction`.`id`,
      'employeeId', `deduction`.`employeeId`,
      'deductionTypeId', `deduction`.`deductionTypeId`,
      'employeeLoanId', `deduction`.`employeeLoanId`,
      'amount', `deduction`.`amount`,
      'remarks', `deduction`.`remarks`
    ))
    FROM `PayrollDeduction` AS `deduction`
    WHERE `deduction`.`payrollId` = `period`.`id`
      AND `deduction`.`tenantId` = `period`.`tenantId`
  ), JSON_ARRAY()),
  JSON_ARRAY(),
  JSON_ARRAY(),
  JSON_OBJECT(
    'grossPay', COALESCE((SELECT SUM(`slip`.`grossPay`) FROM `Payslip` AS `slip` WHERE `slip`.`payrollId` = `period`.`id`), 0),
    'deduction', COALESCE((SELECT SUM(`slip`.`deduction`) FROM `Payslip` AS `slip` WHERE `slip`.`payrollId` = `period`.`id`), 0),
    'netPay', COALESCE((SELECT SUM(`slip`.`netPay`) FROM `Payslip` AS `slip` WHERE `slip`.`payrollId` = `period`.`id`), 0),
    'source', 'LEGACY_BACKFILL'
  ),
  NULL,
  `period`.`createdById`,
  `period`.`updatedAt`
FROM `PayrollPeriod` AS `period`
WHERE `period`.`status` IN ('CALCULATED', 'FINALIZED', 'POSTING', 'POSTED', 'POST_FAILED', 'PAID')
  AND EXISTS (SELECT 1 FROM `Payslip` AS `slip` WHERE `slip`.`payrollId` = `period`.`id`);

INSERT INTO `PayrollCalculationRevisionPayslip` (
  `tenantId`, `id`, `revisionId`, `payslipId`, `employeeId`, `snapshot`,
  `grossPay`, `deduction`, `netPay`, `grossPayDelta`, `deductionDelta`, `netPayDelta`, `createdAt`
)
SELECT
  `slip`.`tenantId`,
  CONCAT('prs_', LEFT(SHA2(CONCAT(`slip`.`tenantId`, ':', `slip`.`id`, ':1'), 256), 28)),
  CONCAT('prv_', LEFT(SHA2(CONCAT(`period`.`tenantId`, ':', `period`.`id`, ':1'), 256), 28)),
  `slip`.`id`,
  `slip`.`employeeId`,
  JSON_OBJECT(
    'id', `slip`.`id`,
    'employeeId', `slip`.`employeeId`,
    'compensationId', `slip`.`compensationId`,
    'compensationSnapshot', `slip`.`compensationSnapshot`,
    'payableDays', `slip`.`payableDays`,
    'absentDays', `slip`.`absentDays`,
    'overtimeHours', `slip`.`overtimeHours`,
    'basicPay', `slip`.`basicPay`,
    'overtimePay', `slip`.`overtimePay`,
    'allowance', `slip`.`allowance`,
    'deduction', `slip`.`deduction`,
    'grossPay', `slip`.`grossPay`,
    'netPay', `slip`.`netPay`,
    'source', 'LEGACY_BACKFILL'
  ),
  `slip`.`grossPay`,
  `slip`.`deduction`,
  `slip`.`netPay`,
  0,
  0,
  0,
  `period`.`updatedAt`
FROM `Payslip` AS `slip`
INNER JOIN `PayrollPeriod` AS `period`
  ON `period`.`id` = `slip`.`payrollId`
 AND `period`.`tenantId` = `slip`.`tenantId`
WHERE `period`.`status` IN ('CALCULATED', 'FINALIZED', 'POSTING', 'POSTED', 'POST_FAILED', 'PAID');

ALTER TABLE `PayrollCalculationRevision`
  ADD CONSTRAINT `PayrollCalculationRevision_payrollId_fkey`
    FOREIGN KEY (`payrollId`) REFERENCES `PayrollPeriod`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PayrollCalculationRevision_parentRevisionId_fkey`
    FOREIGN KEY (`parentRevisionId`) REFERENCES `PayrollCalculationRevision`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PayrollCalculationRevision_reversedRevisionId_fkey`
    FOREIGN KEY (`reversedRevisionId`) REFERENCES `PayrollCalculationRevision`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PayrollCalculationRevision_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PayrollCalculationRevisionPayslip`
  ADD CONSTRAINT `PayrollCalcRevSlip_revisionId_fkey`
    FOREIGN KEY (`revisionId`) REFERENCES `PayrollCalculationRevision`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `PayrollCalcRevSlip_payslipId_fkey`
    FOREIGN KEY (`payslipId`) REFERENCES `Payslip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `PayrollCalcRevSlip_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
