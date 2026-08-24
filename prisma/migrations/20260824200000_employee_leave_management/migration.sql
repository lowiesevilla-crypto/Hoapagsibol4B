-- PAY-TASK-009 / PAY-EMP-005 / PAY-ATT-001
-- Tenant-configurable leave, protected statutory definitions, balances, approval
-- evidence, and attendance/payroll linkage.

CREATE TABLE `LeaveType` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(80) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `description` TEXT NULL,
  `payrollTreatment` ENUM('PAID_LEAVE', 'UNPAID_LEAVE', 'TRACK_ONLY') NOT NULL DEFAULT 'PAID_LEAVE',
  `requiresBalance` BOOLEAN NOT NULL DEFAULT TRUE,
  `annualEntitlementDays` DECIMAL(7, 2) NULL,
  `eligibilityServiceMonths` INTEGER NOT NULL DEFAULT 0,
  `maximumDaysPerRequest` DECIMAL(7, 2) NULL,
  `dayCountingMethod` ENUM('WORKING_DAYS', 'CALENDAR_DAYS') NOT NULL DEFAULT 'WORKING_DAYS',
  `statutoryProtected` BOOLEAN NOT NULL DEFAULT FALSE,
  `statutoryAuthority` VARCHAR(191) NULL,
  `sourceSnapshot` JSON NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `LeaveType_scope_code_key`(`tenantId`, `code`),
  INDEX `LeaveType_scope_active_idx`(`tenantId`, `active`, `name`),
  INDEX `LeaveType_scope_statutory_idx`(`tenantId`, `statutoryProtected`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmployeeLeaveBalance` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `leaveTypeId` VARCHAR(191) NOT NULL,
  `year` INTEGER NOT NULL,
  `entitlementDays` DECIMAL(7, 2) NOT NULL DEFAULT 0,
  `carriedForwardDays` DECIMAL(7, 2) NOT NULL DEFAULT 0,
  `adjustmentDays` DECIMAL(7, 2) NOT NULL DEFAULT 0,
  `usedDays` DECIMAL(7, 2) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `EmpLeaveBalance_scope_year_key`(`tenantId`, `employeeId`, `leaveTypeId`, `year`),
  INDEX `EmpLeaveBalance_scope_employee_idx`(`tenantId`, `employeeId`, `year`),
  INDEX `EmpLeaveBalance_scope_type_idx`(`tenantId`, `leaveTypeId`, `year`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LeaveRequest` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `leaveTypeId` VARCHAR(191) NOT NULL,
  `startDate` DATE NOT NULL,
  `endDate` DATE NOT NULL,
  `requestedDays` DECIMAL(7, 2) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `evidenceReference` VARCHAR(500) NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `leaveTypeSnapshot` JSON NOT NULL,
  `reviewedById` VARCHAR(191) NULL,
  `reviewRemarks` VARCHAR(500) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `LeaveRequest_scope_status_idx`(`tenantId`, `status`, `startDate`),
  INDEX `LeaveRequest_scope_employee_idx`(`tenantId`, `employeeId`, `startDate`, `endDate`),
  INDEX `LeaveRequest_reviewedById_idx`(`reviewedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LeaveBalanceTransaction` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `balanceId` VARCHAR(191) NOT NULL,
  `leaveRequestId` VARCHAR(191) NULL,
  `type` ENUM('ENTITLEMENT', 'ADJUSTMENT', 'USAGE', 'REVERSAL') NOT NULL,
  `days` DECIMAL(7, 2) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `actorId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `LeaveBalanceTx_scope_request_key`(`tenantId`, `leaveRequestId`, `type`),
  INDEX `LeaveBalanceTx_scope_balance_idx`(`tenantId`, `balanceId`, `createdAt`),
  INDEX `LeaveBalanceTransaction_actorId_idx`(`actorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Attendance`
  ADD COLUMN `leaveRequestId` VARCHAR(191) NULL,
  ADD INDEX `Attendance_leaveRequestId_idx`(`leaveRequestId`);

ALTER TABLE `EmployeeLeaveBalance`
  ADD CONSTRAINT `EmpLeaveBalance_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `EmpLeaveBalance_type_fk` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LeaveRequest`
  ADD CONSTRAINT `LeaveRequest_employee_fk` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `LeaveRequest_type_fk` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `LeaveRequest_reviewer_fk` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `LeaveBalanceTransaction`
  ADD CONSTRAINT `LeaveBalanceTx_balance_fk` FOREIGN KEY (`balanceId`) REFERENCES `EmployeeLeaveBalance`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `LeaveBalanceTx_request_fk` FOREIGN KEY (`leaveRequestId`) REFERENCES `LeaveRequest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `LeaveBalanceTx_actor_fk` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Attendance`
  ADD CONSTRAINT `Attendance_leaveRequest_fk` FOREIGN KEY (`leaveRequestId`) REFERENCES `LeaveRequest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- The protected presets are tenant-owned rows but their legal formula fields
-- cannot be edited by tenant actions. Source metadata is snapshotted again on
-- every request so later legal updates do not rewrite historical approvals.
INSERT INTO `LeaveType` (`tenantId`, `id`, `code`, `name`, `description`, `payrollTreatment`, `requiresBalance`, `annualEntitlementDays`, `eligibilityServiceMonths`, `maximumDaysPerRequest`, `dayCountingMethod`, `statutoryProtected`, `statutoryAuthority`, `sourceSnapshot`, `active`, `updatedAt`)
SELECT `id`, CONCAT('leave_sil_', LEFT(SHA2(`id`, 256), 24)), 'SERVICE_INCENTIVE_LEAVE', 'Service Incentive Leave', 'Five paid working days after at least one year of service.', 'PAID_LEAVE', TRUE, 5.00, 12, 5.00, 'WORKING_DAYS', TRUE, 'Labor Code Article 95', JSON_OBJECT('verifiedAsOf', '2026-08-24', 'entitlement', '5 days after one year of service', 'source', 'DOLE Handbook on Workers Statutory Monetary Benefits, 2024 Edition', 'url', 'https://nwpc.dole.gov.ph/wp-content/uploads/2024/11/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf'), TRUE, CURRENT_TIMESTAMP(3) FROM `Tenant`;

INSERT INTO `LeaveType` (`tenantId`, `id`, `code`, `name`, `description`, `payrollTreatment`, `requiresBalance`, `annualEntitlementDays`, `eligibilityServiceMonths`, `maximumDaysPerRequest`, `dayCountingMethod`, `statutoryProtected`, `statutoryAuthority`, `sourceSnapshot`, `active`, `updatedAt`)
SELECT `id`, CONCAT('leave_mat_', LEFT(SHA2(`id`, 256), 24)), 'MATERNITY_LEAVE', 'Maternity Leave', 'Protected maternity-benefit leave; HR validates qualifying event and supporting evidence.', 'TRACK_ONLY', FALSE, NULL, 0, 120.00, 'CALENDAR_DAYS', TRUE, 'Republic Act No. 11210', JSON_OBJECT('verifiedAsOf', '2026-08-24', 'standardLiveBirthDays', 105, 'soloParentAdditionalDays', 15, 'miscarriageOrEmergencyTerminationDays', 60, 'source', 'DOLE Handbook on Workers Statutory Monetary Benefits, 2024 Edition', 'url', 'https://nwpc.dole.gov.ph/wp-content/uploads/2024/11/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf'), TRUE, CURRENT_TIMESTAMP(3) FROM `Tenant`;

INSERT INTO `LeaveType` (`tenantId`, `id`, `code`, `name`, `description`, `payrollTreatment`, `requiresBalance`, `annualEntitlementDays`, `eligibilityServiceMonths`, `maximumDaysPerRequest`, `dayCountingMethod`, `statutoryProtected`, `statutoryAuthority`, `sourceSnapshot`, `active`, `updatedAt`)
SELECT `id`, CONCAT('leave_pat_', LEFT(SHA2(`id`, 256), 24)), 'PATERNITY_LEAVE', 'Paternity Leave', 'Seven paid working days for a qualifying delivery; HR validates statutory eligibility.', 'PAID_LEAVE', FALSE, NULL, 0, 7.00, 'WORKING_DAYS', TRUE, 'Republic Act No. 8187', JSON_OBJECT('verifiedAsOf', '2026-08-24', 'maximumDays', 7, 'source', 'DOLE Handbook on Workers Statutory Monetary Benefits, 2024 Edition', 'url', 'https://nwpc.dole.gov.ph/wp-content/uploads/2024/11/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf'), TRUE, CURRENT_TIMESTAMP(3) FROM `Tenant`;

INSERT INTO `LeaveType` (`tenantId`, `id`, `code`, `name`, `description`, `payrollTreatment`, `requiresBalance`, `annualEntitlementDays`, `eligibilityServiceMonths`, `maximumDaysPerRequest`, `dayCountingMethod`, `statutoryProtected`, `statutoryAuthority`, `sourceSnapshot`, `active`, `updatedAt`)
SELECT `id`, CONCAT('leave_solo_', LEFT(SHA2(`id`, 256), 24)), 'SOLO_PARENT_LEAVE', 'Solo Parent Leave', 'Seven paid working days annually for a qualified solo parent after the protected service period.', 'PAID_LEAVE', TRUE, 7.00, 6, 7.00, 'WORKING_DAYS', TRUE, 'Republic Act No. 11861', JSON_OBJECT('verifiedAsOf', '2026-08-24', 'maximumAnnualDays', 7, 'minimumServiceMonths', 6, 'source', 'DOLE Handbook on Workers Statutory Monetary Benefits, 2024 Edition', 'url', 'https://nwpc.dole.gov.ph/wp-content/uploads/2024/11/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf'), TRUE, CURRENT_TIMESTAMP(3) FROM `Tenant`;

INSERT INTO `LeaveType` (`tenantId`, `id`, `code`, `name`, `description`, `payrollTreatment`, `requiresBalance`, `annualEntitlementDays`, `eligibilityServiceMonths`, `maximumDaysPerRequest`, `dayCountingMethod`, `statutoryProtected`, `statutoryAuthority`, `sourceSnapshot`, `active`, `updatedAt`)
SELECT `id`, CONCAT('leave_vawc_', LEFT(SHA2(`id`, 256), 24)), 'VAWC_LEAVE', 'VAWC Leave', 'Paid protected leave for a qualified victim of violence against women and children; evidence remains restricted HR data.', 'PAID_LEAVE', FALSE, NULL, 0, 10.00, 'WORKING_DAYS', TRUE, 'Republic Act No. 9262', JSON_OBJECT('verifiedAsOf', '2026-08-24', 'initialMaximumDays', 10, 'extendibleByCourtOrder', TRUE, 'source', 'DOLE Handbook on Workers Statutory Monetary Benefits, 2024 Edition', 'url', 'https://nwpc.dole.gov.ph/wp-content/uploads/2024/11/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf'), TRUE, CURRENT_TIMESTAMP(3) FROM `Tenant`;

INSERT INTO `LeaveType` (`tenantId`, `id`, `code`, `name`, `description`, `payrollTreatment`, `requiresBalance`, `annualEntitlementDays`, `eligibilityServiceMonths`, `maximumDaysPerRequest`, `dayCountingMethod`, `statutoryProtected`, `statutoryAuthority`, `sourceSnapshot`, `active`, `updatedAt`)
SELECT `id`, CONCAT('leave_women_', LEFT(SHA2(`id`, 256), 24)), 'SPECIAL_LEAVE_FOR_WOMEN', 'Special Leave for Women', 'Protected full-pay leave following qualified surgery for a gynecological disorder; HR validates statutory evidence.', 'PAID_LEAVE', FALSE, NULL, 0, 60.00, 'CALENDAR_DAYS', TRUE, 'Republic Act No. 9710', JSON_OBJECT('verifiedAsOf', '2026-08-24', 'maximumPeriod', 'two months', 'source', 'DOLE Handbook on Workers Statutory Monetary Benefits, 2024 Edition', 'url', 'https://nwpc.dole.gov.ph/wp-content/uploads/2024/11/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf'), TRUE, CURRENT_TIMESTAMP(3) FROM `Tenant`;
