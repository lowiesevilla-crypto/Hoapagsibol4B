-- PAY-TASK-007 / PAY-FIN-001 / PAY-FIN-002 / PAY-FIN-003
-- Durable payroll posting, balanced journal entries, retry and reconciliation.

CREATE TABLE `FinancialJournalEntry` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `entryDate` DATE NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `sourceType` VARCHAR(80) NOT NULL,
  `sourceId` VARCHAR(191) NOT NULL,
  `sourceRevisionId` VARCHAR(191) NULL,
  `eventType` VARCHAR(40) NOT NULL,
  `status` ENUM('POSTED', 'VOIDED') NOT NULL DEFAULT 'POSTED',
  `postedById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `FinJournal_scope_idem_key`(`tenantId`, `idempotencyKey`),
  INDEX `FinJournal_scope_date_idx`(`tenantId`, `entryDate`),
  INDEX `FinJournal_scope_source_idx`(`tenantId`, `sourceType`, `sourceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FinancialJournalLine` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `journalEntryId` VARCHAR(191) NOT NULL,
  `lineOrder` INTEGER NOT NULL,
  `accountCode` VARCHAR(60) NOT NULL,
  `accountName` VARCHAR(160) NOT NULL,
  `debit` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `credit` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `FinJournalLine_entry_order_key`(`journalEntryId`, `lineOrder`),
  INDEX `FinJournalLine_scope_account_idx`(`tenantId`, `accountCode`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayrollPostingOutbox` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `eventType` ENUM('POST', 'PAYMENT', 'REVERSAL') NOT NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `attemptCount` INTEGER NOT NULL DEFAULT 0,
  `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lockedAt` DATETIME(3) NULL,
  `processedAt` DATETIME(3) NULL,
  `lastError` VARCHAR(1000) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `PayrollOutbox_scope_idem_key`(`tenantId`, `idempotencyKey`),
  INDEX `PayrollOutbox_ready_idx`(`tenantId`, `status`, `availableAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayrollFinancialPosting` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `payrollId` VARCHAR(191) NOT NULL,
  `revisionId` VARCHAR(191) NOT NULL,
  `eventType` ENUM('POST', 'PAYMENT', 'REVERSAL') NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'POSTED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `outboxId` VARCHAR(191) NOT NULL,
  `journalEntryId` VARCHAR(191) NULL,
  `requestedById` VARCHAR(191) NOT NULL,
  `errorMessage` VARCHAR(1000) NULL,
  `postedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `PayrollFinPost_outbox_key`(`outboxId`),
  UNIQUE INDEX `PayrollFinPost_scope_revision_key`(`tenantId`, `revisionId`, `eventType`),
  UNIQUE INDEX `PayrollFinPost_scope_idem_key`(`tenantId`, `idempotencyKey`),
  INDEX `PayrollFinPost_scope_payroll_idx`(`tenantId`, `payrollId`, `status`),
  INDEX `PayrollFinPost_journal_idx`(`journalEntryId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FinancialJournalLine`
  ADD CONSTRAINT `FinJournalLine_entry_fk`
    FOREIGN KEY (`journalEntryId`) REFERENCES `FinancialJournalEntry`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PayrollFinancialPosting`
  ADD CONSTRAINT `PayrollFinPost_payroll_fk`
    FOREIGN KEY (`payrollId`) REFERENCES `PayrollPeriod`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PayrollFinPost_revision_fk`
    FOREIGN KEY (`revisionId`) REFERENCES `PayrollCalculationRevision`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PayrollFinPost_outbox_fk`
    FOREIGN KEY (`outboxId`) REFERENCES `PayrollPostingOutbox`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PayrollFinPost_journal_fk`
    FOREIGN KEY (`journalEntryId`) REFERENCES `FinancialJournalEntry`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
