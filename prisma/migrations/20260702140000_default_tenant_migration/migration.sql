-- Phase 3: create the default Pagsibol tenant and assign every existing
-- tenant-owned local row. Relational foreign keys and tenant-scoped indexes
-- are intentionally deferred to Phase 4.

INSERT INTO `Tenant` (
    `id`, `name`, `shortName`, `slug`, `logoUrl`, `address`, `contactNumber`,
    `email`, `secRegistrationNumber`, `tinNumber`, `status`,
    `subscriptionPlan`, `subscriptionStatus`, `createdAt`, `updatedAt`
)
VALUES (
    'tenant_pagsibol4b_default',
    COALESCE(NULLIF((SELECT `value` FROM `SystemSetting` WHERE `category` = 'ASSOCIATION' AND `key` = 'ASSOCIATION_NAME' LIMIT 1), ''), 'PAGSIBOL VILLAGE PH2 4B EAST'),
    'PAGSIBOL 4B EAST',
    'pagsibol4b',
    COALESCE(NULLIF((SELECT `value` FROM `SystemSetting` WHERE `category` = 'ASSOCIATION' AND `key` = 'ASSOCIATION_LOGO_URL' LIMIT 1), ''), '/pagsibol-logo.png'),
    COALESCE(NULLIF((SELECT `value` FROM `SystemSetting` WHERE `category` = 'ASSOCIATION' AND `key` = 'ASSOCIATION_ADDRESS' LIMIT 1), ''), 'Pagsibol Village Phase 2 4B East'),
    NULLIF((SELECT `value` FROM `SystemSetting` WHERE `category` = 'ASSOCIATION' AND `key` = 'ASSOCIATION_CONTACT_NUMBER' LIMIT 1), ''),
    NULLIF((SELECT `value` FROM `SystemSetting` WHERE `category` = 'ASSOCIATION' AND `key` = 'ASSOCIATION_EMAIL' LIMIT 1), ''),
    NULLIF((SELECT `value` FROM `SystemSetting` WHERE `category` = 'ASSOCIATION' AND `key` = 'ASSOCIATION_SEC_REGISTRATION_NUMBER' LIMIT 1), ''),
    NULLIF((SELECT `value` FROM `SystemSetting` WHERE `category` = 'ASSOCIATION' AND `key` = 'ASSOCIATION_TIN_NUMBER' LIMIT 1), ''),
    'ACTIVE', 'ENTERPRISE', 'ACTIVE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
);

ALTER TABLE `User` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `HomeownerProfile` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `ContractorProfile` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `Bill` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `DuesExemption` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `Payment` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `PaymentArchive` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `Collection` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `Vehicle` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `BondRefund` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `ReceiptCounter` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `DataMigration` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `DocumentTemplate` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `DocumentRequest` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `DocumentVersion` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `OrganizationOfficer` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `OrganizationOfficerHistory` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `DocumentRequestHistory` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `DocumentCounter` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `EmployeeProfile` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `PayrollDeductionType` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `EmployeeLoan` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `Attendance` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `PayrollAccess` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `AuditLog` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `PayrollCalendarDay` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `EmployeeSchedule` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `AttendanceAdjustment` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `OvertimeRecord` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `PayrollPeriod` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `PayrollArchive` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `PayrollDeduction` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `Payslip` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `ExpenseCategory` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `Expense` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `Announcement` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `Event` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `NotificationLog` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `PasswordResetToken` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `PasswordResetAttempt` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `SystemSetting` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `PaymentRequest` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `ChatConversation` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `ChatParticipant` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `ChatMessage` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `ChatAttachment` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
ALTER TABLE `UserPresence` ADD COLUMN `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default';
