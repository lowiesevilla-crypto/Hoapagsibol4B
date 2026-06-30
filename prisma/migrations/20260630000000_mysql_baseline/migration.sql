-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('SYSTEM_ADMIN', 'ADMIN', 'HOMEOWNER', 'EMPLOYEE') NOT NULL DEFAULT 'HOMEOWNER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HomeownerProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `block` VARCHAR(191) NOT NULL,
    `lot` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `birthDate` DATE NULL,
    `civilStatus` VARCHAR(191) NULL,
    `citizenship` VARCHAR(191) NULL,
    `occupation` VARCHAR(191) NULL,
    `residencyDate` DATE NULL,
    `phase` VARCHAR(191) NULL,
    `propertyType` VARCHAR(191) NULL,
    `occupancyStatus` VARCHAR(191) NULL,
    `messengerId` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `monthlyDuesAmount` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HomeownerProfile_userId_key`(`userId`),
    INDEX `HomeownerProfile_status_idx`(`status`),
    UNIQUE INDEX `HomeownerProfile_block_lot_key`(`block`, `lot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContractorProfile` (
    `id` VARCHAR(191) NOT NULL,
    `companyName` VARCHAR(191) NOT NULL,
    `contactPerson` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `licenseNumber` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ContractorProfile_companyName_key`(`companyName`),
    INDEX `ContractorProfile_companyName_idx`(`companyName`),
    INDEX `ContractorProfile_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Bill` (
    `id` VARCHAR(191) NOT NULL,
    `homeownerId` VARCHAR(191) NOT NULL,
    `billingMonth` DATE NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `penalty` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `amountPaid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `balance` DECIMAL(12, 2) NOT NULL,
    `dueDate` DATE NOT NULL,
    `status` ENUM('PAID', 'PARTIAL', 'UNPAID', 'OVERDUE') NOT NULL DEFAULT 'UNPAID',
    `notes` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,
    `archivedById` VARCHAR(191) NULL,
    `archiveReason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Bill_status_dueDate_idx`(`status`, `dueDate`),
    INDEX `Bill_billingMonth_idx`(`billingMonth`),
    INDEX `Bill_archivedAt_status_dueDate_idx`(`archivedAt`, `status`, `dueDate`),
    INDEX `Bill_archivedById_idx`(`archivedById`),
    UNIQUE INDEX `Bill_homeownerId_billingMonth_key`(`homeownerId`, `billingMonth`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DuesExemption` (
    `id` VARCHAR(191) NOT NULL,
    `homeownerId` VARCHAR(191) NOT NULL,
    `billingMonth` DATE NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DuesExemption_billingMonth_idx`(`billingMonth`),
    UNIQUE INDEX `DuesExemption_homeownerId_billingMonth_key`(`homeownerId`, `billingMonth`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `billId` VARCHAR(191) NOT NULL,
    `homeownerId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `paymentDate` DATE NOT NULL,
    `method` ENUM('CASH', 'BANK_TRANSFER', 'GCASH', 'CHECK', 'OTHER') NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `paymentBatchId` VARCHAR(191) NULL,
    `coverageStart` DATE NULL,
    `coverageEnd` DATE NULL,
    `coverageMonths` JSON NULL,
    `coverageFromMonth` INTEGER NULL,
    `coverageFromYear` INTEGER NULL,
    `coverageToMonth` INTEGER NULL,
    `coverageToYear` INTEGER NULL,
    `paymentCoverageDisplay` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `receiptNumber` VARCHAR(191) NULL,
    `proofUrl` VARCHAR(191) NULL,
    `proofFileName` VARCHAR(191) NULL,
    `proofContentType` VARCHAR(191) NULL,
    `proofFileSize` INTEGER NULL,
    `status` ENUM('ACTIVE', 'VOIDED') NOT NULL DEFAULT 'ACTIVE',
    `voidedAt` DATETIME(3) NULL,
    `voidedById` VARCHAR(191) NULL,
    `voidReason` VARCHAR(191) NULL,
    `processedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Payment_receiptNumber_key`(`receiptNumber`),
    INDEX `Payment_homeownerId_paymentDate_idx`(`homeownerId`, `paymentDate`),
    INDEX `Payment_billId_idx`(`billId`),
    INDEX `Payment_status_paymentDate_idx`(`status`, `paymentDate`),
    INDEX `Payment_paymentBatchId_idx`(`paymentBatchId`),
    INDEX `Payment_voidedById_idx`(`voidedById`),
    INDEX `Payment_processedById_idx`(`processedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentArchive` (
    `id` VARCHAR(191) NOT NULL,
    `originalPaymentId` VARCHAR(191) NOT NULL,
    `billId` VARCHAR(191) NOT NULL,
    `billingMonth` DATE NOT NULL,
    `homeownerId` VARCHAR(191) NOT NULL,
    `homeownerName` VARCHAR(191) NOT NULL,
    `homeownerAddress` VARCHAR(191) NOT NULL,
    `property` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `paymentDate` DATE NOT NULL,
    `method` ENUM('CASH', 'BANK_TRANSFER', 'GCASH', 'CHECK', 'OTHER') NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `paymentBatchId` VARCHAR(191) NULL,
    `coverageStart` DATE NULL,
    `coverageEnd` DATE NULL,
    `coverageMonths` JSON NULL,
    `coverageFromMonth` INTEGER NULL,
    `coverageFromYear` INTEGER NULL,
    `coverageToMonth` INTEGER NULL,
    `coverageToYear` INTEGER NULL,
    `paymentCoverageDisplay` VARCHAR(191) NULL,
    `receiptNumber` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `proofUrl` VARCHAR(191) NULL,
    `proofFileName` VARCHAR(191) NULL,
    `proofContentType` VARCHAR(191) NULL,
    `proofFileSize` INTEGER NULL,
    `originalCreatedAt` DATETIME(3) NOT NULL,
    `voidedById` VARCHAR(191) NOT NULL,
    `voidedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `voidReason` VARCHAR(191) NULL,

    UNIQUE INDEX `PaymentArchive_originalPaymentId_key`(`originalPaymentId`),
    INDEX `PaymentArchive_voidedAt_idx`(`voidedAt`),
    INDEX `PaymentArchive_homeownerId_paymentDate_idx`(`homeownerId`, `paymentDate`),
    INDEX `PaymentArchive_billId_idx`(`billId`),
    INDEX `PaymentArchive_paymentBatchId_idx`(`paymentBatchId`),
    INDEX `PaymentArchive_voidedById_idx`(`voidedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Collection` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('GATE_PASS', 'STICKER', 'MEMBERSHIP', 'CONSTRUCTION_BOND', 'CONTRACTOR_BOND', 'OTHER') NOT NULL,
    `description` VARCHAR(191) NULL,
    `payerType` ENUM('HOMEOWNER', 'CONTRACTOR') NOT NULL,
    `homeownerId` VARCHAR(191) NULL,
    `contractorId` VARCHAR(191) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `collectionDate` DATE NOT NULL,
    `method` ENUM('CASH', 'BANK_TRANSFER', 'GCASH', 'CHECK', 'OTHER') NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `receiptNumber` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `refundable` BOOLEAN NOT NULL DEFAULT false,
    `amountRefunded` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `amountForfeited` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `refundStatus` ENUM('NOT_APPLICABLE', 'HELD', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FORFEITED') NOT NULL DEFAULT 'NOT_APPLICABLE',
    `forfeitedAt` DATE NULL,
    `forfeitedById` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Collection_receiptNumber_key`(`receiptNumber`),
    INDEX `Collection_type_collectionDate_idx`(`type`, `collectionDate`),
    INDEX `Collection_homeownerId_collectionDate_idx`(`homeownerId`, `collectionDate`),
    INDEX `Collection_contractorId_collectionDate_idx`(`contractorId`, `collectionDate`),
    INDEX `Collection_refundable_refundStatus_idx`(`refundable`, `refundStatus`),
    INDEX `Collection_forfeitedById_idx`(`forfeitedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vehicle` (
    `id` VARCHAR(191) NOT NULL,
    `homeownerId` VARCHAR(191) NOT NULL,
    `plateNumber` VARCHAR(191) NOT NULL,
    `vehicleType` VARCHAR(191) NOT NULL,
    `make` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL,
    `stickerNumber` VARCHAR(191) NOT NULL,
    `stickerCollectionId` VARCHAR(191) NULL,
    `issuedAt` DATE NOT NULL,
    `expiresAt` DATE NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `remarks` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Vehicle_plateNumber_key`(`plateNumber`),
    UNIQUE INDEX `Vehicle_stickerNumber_key`(`stickerNumber`),
    UNIQUE INDEX `Vehicle_stickerCollectionId_key`(`stickerCollectionId`),
    INDEX `Vehicle_homeownerId_status_idx`(`homeownerId`, `status`),
    INDEX `Vehicle_stickerNumber_idx`(`stickerNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BondRefund` (
    `id` VARCHAR(191) NOT NULL,
    `collectionId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `refundDate` DATE NOT NULL,
    `method` ENUM('CASH', 'BANK_TRANSFER', 'GCASH', 'CHECK', 'OTHER') NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `processedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BondRefund_collectionId_refundDate_idx`(`collectionId`, `refundDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReceiptCounter` (
    `series` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`series`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataMigration` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('DUES_OPENING_BALANCE', 'CONSTRUCTION_BOND_OPENING_BALANCE', 'CONTRACTOR_BOND_OPENING_BALANCE', 'DUES_PREVIOUS_COLLECTION', 'CONSTRUCTION_BOND_PREVIOUS_COLLECTION', 'CONTRACTOR_BOND_PREVIOUS_COLLECTION', 'CONSTRUCTION_BOND_REFUND', 'CONTRACTOR_BOND_REFUND', 'CONSTRUCTION_BOND_FORFEITURE', 'CONTRACTOR_BOND_FORFEITURE') NOT NULL,
    `tag` ENUM('MIGRATED', 'OPENING_BALANCE', 'PREVIOUS_COLLECTION') NOT NULL,
    `status` ENUM('VALIDATED', 'POSTED') NOT NULL DEFAULT 'POSTED',
    `homeownerId` VARCHAR(191) NULL,
    `contractorId` VARCHAR(191) NULL,
    `period` DATE NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `remarks` TEXT NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `relatedReceiptNumber` VARCHAR(191) NULL,
    `postedRecordType` VARCHAR(191) NULL,
    `postedRecordId` VARCHAR(191) NULL,
    `dedupeKey` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DataMigration_dedupeKey_key`(`dedupeKey`),
    INDEX `DataMigration_kind_createdAt_idx`(`kind`, `createdAt`),
    INDEX `DataMigration_homeownerId_period_idx`(`homeownerId`, `period`),
    INDEX `DataMigration_contractorId_createdAt_idx`(`contractorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('CERTIFICATE_OF_RESIDENCY', 'CERTIFICATE_OF_GOOD_STANDING', 'CLEARANCE_CERTIFICATE', 'PAYMENT_CERTIFICATION', 'CONSTRUCTION_BOND_CERTIFICATION', 'CONTRACTOR_BOND_CERTIFICATION', 'GATE_PASS', 'MOVE_IN_OUT_PASS') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DocumentTemplate_type_key`(`type`),
    INDEX `DocumentTemplate_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentRequest` (
    `id` VARCHAR(191) NOT NULL,
    `documentNumber` VARCHAR(191) NULL,
    `homeownerId` VARCHAR(191) NOT NULL,
    `origin` ENUM('HOMEOWNER', 'ADMIN') NOT NULL DEFAULT 'HOMEOWNER',
    `initiatedById` VARCHAR(191) NULL,
    `type` ENUM('CERTIFICATE_OF_RESIDENCY', 'CERTIFICATE_OF_GOOD_STANDING', 'CLEARANCE_CERTIFICATE', 'PAYMENT_CERTIFICATION', 'CONSTRUCTION_BOND_CERTIFICATION', 'CONTRACTOR_BOND_CERTIFICATION', 'GATE_PASS', 'MOVE_IN_OUT_PASS') NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'GENERATED', 'DOWNLOADED') NOT NULL DEFAULT 'SUBMITTED',
    `purpose` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `adminRemarks` VARCHAR(191) NULL,
    `validityDate` DATE NULL,
    `scheduledDate` DATE NULL,
    `startTime` VARCHAR(191) NULL,
    `endTime` VARCHAR(191) NULL,
    `passType` VARCHAR(191) NULL,
    `vehicleDetails` VARCHAR(191) NULL,
    `partyName` VARCHAR(191) NULL,
    `contractorDetails` VARCHAR(191) NULL,
    `representativeName` VARCHAR(191) NULL,
    `propertyDetails` VARCHAR(191) NULL,
    `outstandingBalanceAtRequest` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `allowDownloadDespiteBalance` BOOLEAN NOT NULL DEFAULT false,
    `downloadOverrideReason` VARCHAR(191) NULL,
    `downloadOverrideAt` DATETIME(3) NULL,
    `downloadOverrideById` VARCHAR(191) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `generatedAt` DATETIME(3) NULL,
    `downloadedAt` DATETIME(3) NULL,
    `processedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `processedByOfficerId` VARCHAR(191) NULL,
    `approvedByOfficerId` VARCHAR(191) NULL,
    `templateVersion` INTEGER NULL,
    `templateSnapshot` TEXT NULL,
    `generatedContent` TEXT NULL,
    `associationSnapshot` JSON NULL,
    `homeownerSnapshot` JSON NULL,
    `organizationSnapshot` JSON NULL,
    `processedOfficerSnapshot` JSON NULL,
    `approvedOfficerSnapshot` JSON NULL,
    `verificationCode` VARCHAR(191) NULL,
    `currentVersion` INTEGER NOT NULL DEFAULT 0,
    `archivedAt` DATETIME(3) NULL,
    `archivedById` VARCHAR(191) NULL,
    `archiveReason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DocumentRequest_documentNumber_key`(`documentNumber`),
    UNIQUE INDEX `DocumentRequest_verificationCode_key`(`verificationCode`),
    INDEX `DocumentRequest_homeownerId_requestedAt_idx`(`homeownerId`, `requestedAt`),
    INDEX `DocumentRequest_status_requestedAt_idx`(`status`, `requestedAt`),
    INDEX `DocumentRequest_type_requestedAt_idx`(`type`, `requestedAt`),
    INDEX `DocumentRequest_processedById_idx`(`processedById`),
    INDEX `DocumentRequest_approvedById_idx`(`approvedById`),
    INDEX `DocumentRequest_downloadOverrideById_idx`(`downloadOverrideById`),
    INDEX `DocumentRequest_processedByOfficerId_idx`(`processedByOfficerId`),
    INDEX `DocumentRequest_approvedByOfficerId_idx`(`approvedByOfficerId`),
    INDEX `DocumentRequest_origin_requestedAt_idx`(`origin`, `requestedAt`),
    INDEX `DocumentRequest_archivedAt_requestedAt_idx`(`archivedAt`, `requestedAt`),
    INDEX `DocumentRequest_initiatedById_idx`(`initiatedById`),
    INDEX `DocumentRequest_archivedById_idx`(`archivedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentVersion` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `documentNumber` VARCHAR(191) NOT NULL,
    `verificationCode` VARCHAR(191) NOT NULL,
    `templateVersion` INTEGER NOT NULL,
    `templateSnapshot` TEXT NOT NULL,
    `generatedContent` TEXT NOT NULL,
    `requestSnapshot` JSON NOT NULL,
    `generatedById` VARCHAR(191) NULL,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DocumentVersion_requestId_createdAt_idx`(`requestId`, `createdAt`),
    INDEX `DocumentVersion_generatedById_idx`(`generatedById`),
    UNIQUE INDEX `DocumentVersion_requestId_version_key`(`requestId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrganizationOfficer` (
    `id` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NOT NULL,
    `committee` VARCHAR(191) NULL,
    `contactNumber` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `photoUrl` VARCHAR(191) NULL,
    `signatureUrl` VARCHAR(191) NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `effectiveDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `archivedAt` DATETIME(3) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OrganizationOfficer_active_archivedAt_displayOrder_idx`(`active`, `archivedAt`, `displayOrder`),
    INDEX `OrganizationOfficer_effectiveDate_endDate_idx`(`effectiveDate`, `endDate`),
    INDEX `OrganizationOfficer_updatedById_idx`(`updatedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrganizationOfficerHistory` (
    `id` VARCHAR(191) NOT NULL,
    `officerId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `snapshot` JSON NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrganizationOfficerHistory_officerId_createdAt_idx`(`officerId`, `createdAt`),
    INDEX `OrganizationOfficerHistory_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentRequestHistory` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'GENERATED', 'DOWNLOADED') NOT NULL,
    `note` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DocumentRequestHistory_requestId_createdAt_idx`(`requestId`, `createdAt`),
    INDEX `DocumentRequestHistory_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentCounter` (
    `type` ENUM('CERTIFICATE_OF_RESIDENCY', 'CERTIFICATE_OF_GOOD_STANDING', 'CLEARANCE_CERTIFICATE', 'PAYMENT_CERTIFICATION', 'CONSTRUCTION_BOND_CERTIFICATION', 'CONTRACTOR_BOND_CERTIFICATION', 'GATE_PASS', 'MOVE_IN_OUT_PASS') NOT NULL,
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`type`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `employeeNumber` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `hireDate` DATE NOT NULL,
    `salaryType` ENUM('DAILY', 'MONTHLY') NOT NULL,
    `baseRate` DECIMAL(12, 2) NOT NULL,
    `standardWorkDays` INTEGER NOT NULL DEFAULT 26,
    `fixedAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `fixedDeduction` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EmployeeProfile_userId_key`(`userId`),
    UNIQUE INDEX `EmployeeProfile_employeeNumber_key`(`employeeNumber`),
    INDEX `EmployeeProfile_name_idx`(`name`),
    INDEX `EmployeeProfile_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollDeductionType` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `applyToMonthly` BOOLEAN NOT NULL DEFAULT true,
    `applyToDaily` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PayrollDeductionType_name_key`(`name`),
    INDEX `PayrollDeductionType_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeLoan` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `type` ENUM('CASH_ADVANCE', 'LOAN', 'OTHER') NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `principalAmount` DECIMAL(12, 2) NOT NULL,
    `amountPaid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `balance` DECIMAL(12, 2) NOT NULL,
    `issuedDate` DATE NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `status` ENUM('OPEN', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmployeeLoan_employeeId_status_idx`(`employeeId`, `status`),
    INDEX `EmployeeLoan_issuedDate_idx`(`issuedDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attendance` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `timeIn` VARCHAR(191) NULL,
    `timeOut` VARCHAR(191) NULL,
    `totalHours` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `lateMinutes` INTEGER NOT NULL DEFAULT 0,
    `undertimeMinutes` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('PRESENT', 'HALF_DAY', 'ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY') NOT NULL,
    `overtimeHours` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `nightDifferentialHours` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `isRestDay` BOOLEAN NOT NULL DEFAULT false,
    `holidayType` ENUM('REGULAR_HOLIDAY', 'SPECIAL_NON_WORKING_HOLIDAY', 'SPECIAL_WORKING_HOLIDAY', 'HOA_DECLARED_HOLIDAY', 'WORKING_DAY', 'NON_WORKING_DAY') NULL,
    `remarks` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Attendance_date_status_idx`(`date`, `status`),
    UNIQUE INDEX `Attendance_employeeId_date_key`(`employeeId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollAccess` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('PAYROLL_MANAGER', 'PAYROLL_STAFF', 'HR_ADMIN', 'FINANCE_APPROVER', 'SYSTEM_ADMINISTRATOR', 'READ_ONLY_AUDITOR') NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `grantedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PayrollAccess_role_active_idx`(`role`, `active`),
    INDEX `PayrollAccess_grantedById_idx`(`grantedById`),
    UNIQUE INDEX `PayrollAccess_userId_role_key`(`userId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `module` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_module_createdAt_idx`(`module`, `createdAt`),
    INDEX `AuditLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollCalendarDay` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `type` ENUM('REGULAR_HOLIDAY', 'SPECIAL_NON_WORKING_HOLIDAY', 'SPECIAL_WORKING_HOLIDAY', 'HOA_DECLARED_HOLIDAY', 'WORKING_DAY', 'NON_WORKING_DAY') NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `payRule` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PayrollCalendarDay_date_key`(`date`),
    INDEX `PayrollCalendarDay_type_active_idx`(`type`, `active`),
    INDEX `PayrollCalendarDay_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `dayOfWeek` INTEGER NOT NULL,
    `shiftStart` VARCHAR(191) NOT NULL,
    `shiftEnd` VARCHAR(191) NOT NULL,
    `restDay` BOOLEAN NOT NULL DEFAULT false,
    `effectiveFrom` DATE NOT NULL,
    `effectiveTo` DATE NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmployeeSchedule_employeeId_dayOfWeek_effectiveFrom_idx`(`employeeId`, `dayOfWeek`, `effectiveFrom`),
    INDEX `EmployeeSchedule_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceAdjustment` (
    `id` VARCHAR(191) NOT NULL,
    `attendanceId` VARCHAR(191) NOT NULL,
    `originalData` JSON NOT NULL,
    `adjustedData` JSON NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `requestedById` VARCHAR(191) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AttendanceAdjustment_attendanceId_status_idx`(`attendanceId`, `status`),
    INDEX `AttendanceAdjustment_requestedById_idx`(`requestedById`),
    INDEX `AttendanceAdjustment_reviewedById_idx`(`reviewedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OvertimeRecord` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `attendanceId` VARCHAR(191) NULL,
    `date` DATE NOT NULL,
    `hours` DECIMAL(6, 2) NOT NULL,
    `status` ENUM('DRAFT', 'PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `source` ENUM('APPROVED_REQUEST', 'PAYROLL_MANAGER_ADJUSTMENT') NOT NULL DEFAULT 'APPROVED_REQUEST',
    `reason` VARCHAR(191) NOT NULL,
    `attachmentUrl` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OvertimeRecord_employeeId_date_status_idx`(`employeeId`, `date`, `status`),
    INDEX `OvertimeRecord_attendanceId_idx`(`attendanceId`),
    INDEX `OvertimeRecord_createdById_idx`(`createdById`),
    INDEX `OvertimeRecord_reviewedById_idx`(`reviewedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollPeriod` (
    `id` VARCHAR(191) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `payDate` DATE NOT NULL,
    `status` ENUM('DRAFT', 'FINALIZED', 'PAID') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PayrollPeriod_status_payDate_idx`(`status`, `payDate`),
    UNIQUE INDEX `PayrollPeriod_startDate_endDate_key`(`startDate`, `endDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollArchive` (
    `id` VARCHAR(191) NOT NULL,
    `originalPayrollId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `payDate` DATE NOT NULL,
    `periodSnapshot` JSON NOT NULL,
    `employeeBreakdown` JSON NOT NULL,
    `deductions` JSON NOT NULL,
    `adjustments` JSON NOT NULL,
    `overtimeRecords` JSON NOT NULL,
    `payslipData` JSON NOT NULL,
    `deletedById` VARCHAR(191) NOT NULL,
    `deletedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletionReason` VARCHAR(191) NULL,

    INDEX `PayrollArchive_deletedAt_idx`(`deletedAt`),
    INDEX `PayrollArchive_startDate_endDate_idx`(`startDate`, `endDate`),
    INDEX `PayrollArchive_deletedById_idx`(`deletedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollDeduction` (
    `id` VARCHAR(191) NOT NULL,
    `payrollId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `deductionTypeId` VARCHAR(191) NOT NULL,
    `employeeLoanId` VARCHAR(191) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `remarks` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PayrollDeduction_employeeId_idx`(`employeeId`),
    INDEX `PayrollDeduction_deductionTypeId_idx`(`deductionTypeId`),
    INDEX `PayrollDeduction_employeeLoanId_idx`(`employeeLoanId`),
    UNIQUE INDEX `PayrollDeduction_payrollId_employeeId_deductionTypeId_key`(`payrollId`, `employeeId`, `deductionTypeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payslip` (
    `id` VARCHAR(191) NOT NULL,
    `payrollId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `payableDays` DECIMAL(6, 2) NOT NULL,
    `absentDays` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `overtimeHours` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `basicPay` DECIMAL(12, 2) NOT NULL,
    `overtimePay` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `overtimeSource` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    `allowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `deduction` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `grossPay` DECIMAL(12, 2) NOT NULL,
    `netPay` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Payslip_employeeId_createdAt_idx`(`employeeId`, `createdAt`),
    UNIQUE INDEX `Payslip_payrollId_employeeId_key`(`payrollId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseCategory` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ExpenseCategory_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `payee` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `expenseDate` DATE NOT NULL,
    `method` ENUM('CASH', 'BANK_TRANSFER', 'GCASH', 'CHECK', 'OTHER') NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `voucherNumber` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Expense_expenseDate_categoryId_idx`(`expenseDate`, `categoryId`),
    INDEX `Expense_payee_idx`(`payee`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Announcement` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'GENERAL',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PUBLISHED',
    `imageUrl` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `sendEmail` BOOLEAN NOT NULL DEFAULT false,
    `postToFacebook` BOOLEAN NOT NULL DEFAULT false,
    `facebookStatus` ENUM('NOT_REQUESTED', 'QUEUED', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'NOT_REQUESTED',
    `facebookPostId` VARCHAR(191) NULL,
    `facebookPublishedAt` DATETIME(3) NULL,
    `facebookError` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Announcement_createdAt_idx`(`createdAt`),
    INDEX `Announcement_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Event` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'COMMUNITY',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PUBLISHED',
    `eventDate` DATE NOT NULL,
    `eventTime` VARCHAR(191) NOT NULL,
    `startTime` VARCHAR(191) NULL,
    `endTime` VARCHAR(191) NULL,
    `location` VARCHAR(191) NOT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `postToFacebook` BOOLEAN NOT NULL DEFAULT false,
    `facebookStatus` ENUM('NOT_REQUESTED', 'QUEUED', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'NOT_REQUESTED',
    `facebookPostId` VARCHAR(191) NULL,
    `facebookPublishedAt` DATETIME(3) NULL,
    `facebookError` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Event_eventDate_idx`(`eventDate`),
    INDEX `Event_status_eventDate_idx`(`status`, `eventDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationLog` (
    `id` VARCHAR(191) NOT NULL,
    `recipientId` VARCHAR(191) NOT NULL,
    `type` ENUM('ANNOUNCEMENT', 'BILL_REMINDER', 'PASSWORD_RESET', 'WELCOME', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED', 'PAYMENT_CONFIRMATION', 'BILLING_NOTIFICATION', 'TEST_EMAIL', 'EVENT') NOT NULL,
    `channel` ENUM('EMAIL', 'MESSENGER') NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `status` ENUM('QUEUED', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'QUEUED',
    `sentAt` DATETIME(3) NULL,
    `providerMessageId` VARCHAR(191) NULL,
    `errorMessage` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NotificationLog_recipientId_createdAt_idx`(`recipientId`, `createdAt`),
    INDEX `NotificationLog_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `requestedIpHash` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `PasswordResetToken_expiresAt_usedAt_idx`(`expiresAt`, `usedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `emailHash` VARCHAR(191) NOT NULL,
    `ipHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PasswordResetAttempt_emailHash_createdAt_idx`(`emailHash`, `createdAt`),
    INDEX `PasswordResetAttempt_ipHash_createdAt_idx`(`ipHash`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemSetting` (
    `id` VARCHAR(191) NOT NULL,
    `category` ENUM('ASSOCIATION', 'DATABASE', 'EMAIL', 'FACEBOOK', 'PAYMENT', 'CHAT') NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `value` TEXT NULL,
    `isSecret` BOOLEAN NOT NULL DEFAULT false,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SystemSetting_category_idx`(`category`),
    INDEX `SystemSetting_updatedById_idx`(`updatedById`),
    UNIQUE INDEX `SystemSetting_category_key_key`(`category`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentRequest` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('MONTHLY_DUES', 'OTHER_COLLECTION') NOT NULL,
    `status` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `homeownerId` VARCHAR(191) NOT NULL,
    `billId` VARCHAR(191) NULL,
    `collectionType` ENUM('GATE_PASS', 'STICKER', 'MEMBERSHIP', 'CONSTRUCTION_BOND', 'CONTRACTOR_BOND', 'OTHER') NULL,
    `description` VARCHAR(191) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `paymentDate` DATE NOT NULL,
    `method` ENUM('CASH', 'BANK_TRANSFER', 'GCASH', 'CHECK', 'OTHER') NOT NULL DEFAULT 'GCASH',
    `referenceNumber` VARCHAR(191) NULL,
    `proofImageUrl` VARCHAR(191) NULL,
    `proofFileName` VARCHAR(191) NULL,
    `proofContentType` VARCHAR(191) NULL,
    `proofFileSize` INTEGER NULL,
    `payerNotes` VARCHAR(191) NULL,
    `reviewRemarks` VARCHAR(191) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `paymentId` VARCHAR(191) NULL,
    `collectionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentRequest_paymentId_key`(`paymentId`),
    UNIQUE INDEX `PaymentRequest_collectionId_key`(`collectionId`),
    INDEX `PaymentRequest_homeownerId_createdAt_idx`(`homeownerId`, `createdAt`),
    INDEX `PaymentRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `PaymentRequest_billId_idx`(`billId`),
    INDEX `PaymentRequest_reviewedById_idx`(`reviewedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatConversation` (
    `id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NULL,
    `homeownerId` VARCHAR(191) NULL,
    `assignedToId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `lastMessageAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChatConversation_homeownerId_lastMessageAt_idx`(`homeownerId`, `lastMessageAt`),
    INDEX `ChatConversation_assignedToId_lastMessageAt_idx`(`assignedToId`, `lastMessageAt`),
    INDEX `ChatConversation_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatParticipant` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `lastReadAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `pinnedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChatParticipant_userId_deletedAt_idx`(`userId`, `deletedAt`),
    INDEX `ChatParticipant_pinnedAt_idx`(`pinnedAt`),
    UNIQUE INDEX `ChatParticipant_conversationId_userId_key`(`conversationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `body` VARCHAR(191) NULL,
    `attachmentUrl` VARCHAR(191) NULL,
    `attachmentName` VARCHAR(191) NULL,
    `attachmentContentType` VARCHAR(191) NULL,
    `replyToId` VARCHAR(191) NULL,
    `deletedForEveryoneAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatMessage_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    INDEX `ChatMessage_senderId_createdAt_idx`(`senderId`, `createdAt`),
    INDEX `ChatMessage_replyToId_idx`(`replyToId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `contentType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatAttachment_messageId_idx`(`messageId`),
    INDEX `ChatAttachment_contentType_idx`(`contentType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserPresence` (
    `userId` VARCHAR(191) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `context` VARCHAR(191) NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `HomeownerProfile` ADD CONSTRAINT `HomeownerProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bill` ADD CONSTRAINT `Bill_homeownerId_fkey` FOREIGN KEY (`homeownerId`) REFERENCES `HomeownerProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bill` ADD CONSTRAINT `Bill_archivedById_fkey` FOREIGN KEY (`archivedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DuesExemption` ADD CONSTRAINT `DuesExemption_homeownerId_fkey` FOREIGN KEY (`homeownerId`) REFERENCES `HomeownerProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DuesExemption` ADD CONSTRAINT `DuesExemption_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `Bill`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_homeownerId_fkey` FOREIGN KEY (`homeownerId`) REFERENCES `HomeownerProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_voidedById_fkey` FOREIGN KEY (`voidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_processedById_fkey` FOREIGN KEY (`processedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentArchive` ADD CONSTRAINT `PaymentArchive_voidedById_fkey` FOREIGN KEY (`voidedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Collection` ADD CONSTRAINT `Collection_homeownerId_fkey` FOREIGN KEY (`homeownerId`) REFERENCES `HomeownerProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Collection` ADD CONSTRAINT `Collection_contractorId_fkey` FOREIGN KEY (`contractorId`) REFERENCES `ContractorProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Collection` ADD CONSTRAINT `Collection_forfeitedById_fkey` FOREIGN KEY (`forfeitedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Collection` ADD CONSTRAINT `Collection_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_homeownerId_fkey` FOREIGN KEY (`homeownerId`) REFERENCES `HomeownerProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_stickerCollectionId_fkey` FOREIGN KEY (`stickerCollectionId`) REFERENCES `Collection`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BondRefund` ADD CONSTRAINT `BondRefund_collectionId_fkey` FOREIGN KEY (`collectionId`) REFERENCES `Collection`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BondRefund` ADD CONSTRAINT `BondRefund_processedById_fkey` FOREIGN KEY (`processedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataMigration` ADD CONSTRAINT `DataMigration_homeownerId_fkey` FOREIGN KEY (`homeownerId`) REFERENCES `HomeownerProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataMigration` ADD CONSTRAINT `DataMigration_contractorId_fkey` FOREIGN KEY (`contractorId`) REFERENCES `ContractorProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataMigration` ADD CONSTRAINT `DataMigration_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentTemplate` ADD CONSTRAINT `DocumentTemplate_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentRequest` ADD CONSTRAINT `DocumentRequest_homeownerId_fkey` FOREIGN KEY (`homeownerId`) REFERENCES `HomeownerProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentRequest` ADD CONSTRAINT `DocumentRequest_initiatedById_fkey` FOREIGN KEY (`initiatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentRequest` ADD CONSTRAINT `DocumentRequest_downloadOverrideById_fkey` FOREIGN KEY (`downloadOverrideById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentRequest` ADD CONSTRAINT `DocumentRequest_processedById_fkey` FOREIGN KEY (`processedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentRequest` ADD CONSTRAINT `DocumentRequest_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentRequest` ADD CONSTRAINT `DocumentRequest_processedByOfficerId_fkey` FOREIGN KEY (`processedByOfficerId`) REFERENCES `OrganizationOfficer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentRequest` ADD CONSTRAINT `DocumentRequest_approvedByOfficerId_fkey` FOREIGN KEY (`approvedByOfficerId`) REFERENCES `OrganizationOfficer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentRequest` ADD CONSTRAINT `DocumentRequest_archivedById_fkey` FOREIGN KEY (`archivedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `DocumentRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_generatedById_fkey` FOREIGN KEY (`generatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationOfficer` ADD CONSTRAINT `OrganizationOfficer_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationOfficerHistory` ADD CONSTRAINT `OrganizationOfficerHistory_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `OrganizationOfficer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationOfficerHistory` ADD CONSTRAINT `OrganizationOfficerHistory_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentRequestHistory` ADD CONSTRAINT `DocumentRequestHistory_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `DocumentRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentRequestHistory` ADD CONSTRAINT `DocumentRequestHistory_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeProfile` ADD CONSTRAINT `EmployeeProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeLoan` ADD CONSTRAINT `EmployeeLoan_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollAccess` ADD CONSTRAINT `PayrollAccess_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollAccess` ADD CONSTRAINT `PayrollAccess_grantedById_fkey` FOREIGN KEY (`grantedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollCalendarDay` ADD CONSTRAINT `PayrollCalendarDay_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeSchedule` ADD CONSTRAINT `EmployeeSchedule_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeSchedule` ADD CONSTRAINT `EmployeeSchedule_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceAdjustment` ADD CONSTRAINT `AttendanceAdjustment_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `Attendance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceAdjustment` ADD CONSTRAINT `AttendanceAdjustment_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceAdjustment` ADD CONSTRAINT `AttendanceAdjustment_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OvertimeRecord` ADD CONSTRAINT `OvertimeRecord_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OvertimeRecord` ADD CONSTRAINT `OvertimeRecord_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `Attendance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OvertimeRecord` ADD CONSTRAINT `OvertimeRecord_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OvertimeRecord` ADD CONSTRAINT `OvertimeRecord_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollPeriod` ADD CONSTRAINT `PayrollPeriod_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollArchive` ADD CONSTRAINT `PayrollArchive_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollDeduction` ADD CONSTRAINT `PayrollDeduction_payrollId_fkey` FOREIGN KEY (`payrollId`) REFERENCES `PayrollPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollDeduction` ADD CONSTRAINT `PayrollDeduction_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollDeduction` ADD CONSTRAINT `PayrollDeduction_deductionTypeId_fkey` FOREIGN KEY (`deductionTypeId`) REFERENCES `PayrollDeductionType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollDeduction` ADD CONSTRAINT `PayrollDeduction_employeeLoanId_fkey` FOREIGN KEY (`employeeLoanId`) REFERENCES `EmployeeLoan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payslip` ADD CONSTRAINT `Payslip_payrollId_fkey` FOREIGN KEY (`payrollId`) REFERENCES `PayrollPeriod`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payslip` ADD CONSTRAINT `Payslip_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `ExpenseCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Announcement` ADD CONSTRAINT `Announcement_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationLog` ADD CONSTRAINT `NotificationLog_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SystemSetting` ADD CONSTRAINT `SystemSetting_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRequest` ADD CONSTRAINT `PaymentRequest_homeownerId_fkey` FOREIGN KEY (`homeownerId`) REFERENCES `HomeownerProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRequest` ADD CONSTRAINT `PaymentRequest_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `Bill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRequest` ADD CONSTRAINT `PaymentRequest_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRequest` ADD CONSTRAINT `PaymentRequest_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRequest` ADD CONSTRAINT `PaymentRequest_collectionId_fkey` FOREIGN KEY (`collectionId`) REFERENCES `Collection`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatConversation` ADD CONSTRAINT `ChatConversation_homeownerId_fkey` FOREIGN KEY (`homeownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatConversation` ADD CONSTRAINT `ChatConversation_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatConversation` ADD CONSTRAINT `ChatConversation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatParticipant` ADD CONSTRAINT `ChatParticipant_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatParticipant` ADD CONSTRAINT `ChatParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_replyToId_fkey` FOREIGN KEY (`replyToId`) REFERENCES `ChatMessage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatAttachment` ADD CONSTRAINT `ChatAttachment_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `ChatMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserPresence` ADD CONSTRAINT `UserPresence_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
