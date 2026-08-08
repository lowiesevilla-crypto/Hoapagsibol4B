-- HOAHub platform commercial control plane.
-- Keeps SaaS tenant billing separate from homeowner finance records.

ALTER TABLE `Tenant`
  MODIFY `subscriptionStatus` ENUM('TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE', 'RESTRICTED', 'SUSPENDED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'TRIAL';

CREATE TABLE `SubscriptionPlan` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(60) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'PHP',
  `monthlyPrice` DECIMAL(12, 2) NULL,
  `annualPrice` DECIMAL(12, 2) NULL,
  `setupFee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `trialDays` INTEGER NOT NULL DEFAULT 14,
  `maximumUsers` INTEGER NULL,
  `maximumHomeowners` INTEGER NULL,
  `maximumStorageMb` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SubscriptionPlan_code_key`(`code`),
  INDEX `SubscriptionPlan_active_name_idx`(`active`, `name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SubscriptionPlanModule` (
  `planId` VARCHAR(191) NOT NULL,
  `module` ENUM('BILLING', 'PAYROLL', 'ATTENDANCE', 'DOCUMENTS', 'REPORTS', 'CHAT', 'ANNOUNCEMENTS', 'EVENTS', 'COMPLAINTS', 'VEHICLES', 'VISITORS', 'CONTRACTORS', 'CONSTRUCTION', 'FACILITY_RESERVATION', 'LOANS', 'CASH_ADVANCE') NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`planId`, `module`),
  INDEX `SubscriptionPlanModule_module_enabled_idx`(`module`, `enabled`),
  CONSTRAINT `SubscriptionPlanModule_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SubscriptionPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TenantSubscription` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `planId` VARCHAR(191) NOT NULL,
  `status` ENUM('TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE', 'RESTRICTED', 'SUSPENDED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'TRIAL',
  `billingFrequency` ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL') NOT NULL DEFAULT 'MONTHLY',
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `trialEndsAt` DATETIME(3) NULL,
  `currentPeriodStart` DATE NULL,
  `currentPeriodEnd` DATE NULL,
  `nextBillingDate` DATE NULL,
  `agreedPrice` DECIMAL(12, 2) NULL,
  `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'PHP',
  `autoRenew` BOOLEAN NOT NULL DEFAULT true,
  `autoPayEnabled` BOOLEAN NOT NULL DEFAULT false,
  `gatewayCustomerId` VARCHAR(191) NULL,
  `gatewaySubscriptionId` VARCHAR(191) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `cancellationReason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `TenantSubscription_tenantId_id_key`(`tenantId`, `id`),
  INDEX `TenantSubscription_tenant_status_nextBilling_idx`(`tenantId`, `status`, `nextBillingDate`),
  INDEX `TenantSubscription_plan_status_idx`(`planId`, `status`),
  INDEX `TenantSubscription_gatewaySubscriptionId_idx`(`gatewaySubscriptionId`),
  CONSTRAINT `TenantSubscription_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `TenantSubscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SubscriptionPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TenantBillingProfile` (
  `tenantId` VARCHAR(191) NOT NULL,
  `legalBusinessName` VARCHAR(191) NULL,
  `billingAddress` TEXT NULL,
  `billingEmail` VARCHAR(191) NULL,
  `secondaryBillingEmail` VARCHAR(191) NULL,
  `contactPerson` VARCHAR(191) NULL,
  `contactNumber` VARCHAR(191) NULL,
  `tinNumber` VARCHAR(191) NULL,
  `vatStatus` VARCHAR(191) NULL,
  `invoiceNotes` TEXT NULL,
  `paymentTermsDays` INTEGER NOT NULL DEFAULT 15,
  `purchaseOrderRequired` BOOLEAN NOT NULL DEFAULT false,
  `paymentMethodPreference` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`tenantId`),
  CONSTRAINT `TenantBillingProfile_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PlatformInvoice` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `subscriptionId` VARCHAR(191) NOT NULL,
  `invoiceNumber` VARCHAR(60) NOT NULL,
  `status` ENUM('DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `billingPeriodStart` DATE NOT NULL,
  `billingPeriodEnd` DATE NOT NULL,
  `issueDate` DATE NOT NULL,
  `dueDate` DATE NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'PHP',
  `subtotal` DECIMAL(12, 2) NOT NULL,
  `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `tax` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12, 2) NOT NULL,
  `amountPaid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `outstandingBalance` DECIMAL(12, 2) NOT NULL,
  `notes` TEXT NULL,
  `finalizedAt` DATETIME(3) NULL,
  `paidAt` DATETIME(3) NULL,
  `voidedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PlatformInvoice_invoiceNumber_key`(`invoiceNumber`),
  UNIQUE INDEX `PlatformInvoice_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `PlatformInvoice_subscription_period_key`(`subscriptionId`, `billingPeriodStart`, `billingPeriodEnd`),
  INDEX `PlatformInvoice_tenant_status_due_idx`(`tenantId`, `status`, `dueDate`),
  INDEX `PlatformInvoice_tenant_issue_idx`(`tenantId`, `issueDate`),
  CONSTRAINT `PlatformInvoice_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PlatformInvoice_subscription_fkey` FOREIGN KEY (`tenantId`, `subscriptionId`) REFERENCES `TenantSubscription`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PlatformInvoiceLine` (
  `id` VARCHAR(191) NOT NULL,
  `invoiceId` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NOT NULL,
  `quantity` INTEGER NOT NULL DEFAULT 1,
  `unitAmount` DECIMAL(12, 2) NOT NULL,
  `lineTotal` DECIMAL(12, 2) NOT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `PlatformInvoiceLine_invoiceId_idx`(`invoiceId`),
  CONSTRAINT `PlatformInvoiceLine_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `PlatformInvoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PlatformPayment` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `paymentReference` VARCHAR(80) NOT NULL,
  `gateway` ENUM('PAYMONGO', 'XENDIT', 'MANUAL') NOT NULL,
  `gatewayPaymentId` VARCHAR(191) NULL,
  `gatewayCheckoutId` VARCHAR(191) NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'PHP',
  `fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `netAmount` DECIMAL(12, 2) NOT NULL,
  `method` ENUM('PAYMONGO_CHECKOUT', 'PAYMONGO_GCASH', 'PAYMONGO_MAYA', 'PAYMONGO_QRPH', 'PAYMONGO_CARD', 'PAYMONGO_BANK', 'BANK_TRANSFER', 'CASH', 'CHECK', 'MANUAL', 'OTHER') NOT NULL,
  `status` ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED') NOT NULL DEFAULT 'PENDING',
  `paidAt` DATETIME(3) NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PlatformPayment_paymentReference_key`(`paymentReference`),
  UNIQUE INDEX `PlatformPayment_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `PlatformPayment_gateway_payment_key`(`gateway`, `gatewayPaymentId`),
  UNIQUE INDEX `PlatformPayment_gateway_checkout_key`(`gateway`, `gatewayCheckoutId`),
  INDEX `PlatformPayment_tenant_status_paid_idx`(`tenantId`, `status`, `paidAt`),
  CONSTRAINT `PlatformPayment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PlatformPaymentAllocation` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `paymentId` VARCHAR(191) NOT NULL,
  `invoiceId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PlatformPaymentAllocation_payment_invoice_key`(`paymentId`, `invoiceId`),
  INDEX `PlatformPaymentAllocation_tenant_payment_idx`(`tenantId`, `paymentId`),
  INDEX `PlatformPaymentAllocation_tenant_invoice_idx`(`tenantId`, `invoiceId`),
  CONSTRAINT `PlatformPaymentAllocation_payment_fkey` FOREIGN KEY (`tenantId`, `paymentId`) REFERENCES `PlatformPayment`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PlatformPaymentAllocation_invoice_fkey` FOREIGN KEY (`tenantId`, `invoiceId`) REFERENCES `PlatformInvoice`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PlatformGatewayEvent` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NULL,
  `provider` ENUM('PAYMONGO', 'XENDIT', 'MANUAL') NOT NULL,
  `providerEventId` VARCHAR(191) NOT NULL,
  `eventType` VARCHAR(120) NOT NULL,
  `livemode` BOOLEAN NOT NULL DEFAULT false,
  `signatureVerified` BOOLEAN NOT NULL DEFAULT false,
  `rawPayload` JSON NOT NULL,
  `status` ENUM('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED') NOT NULL DEFAULT 'RECEIVED',
  `processingError` TEXT NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PlatformGatewayEvent_provider_event_key`(`provider`, `providerEventId`),
  INDEX `PlatformGatewayEvent_tenant_received_idx`(`tenantId`, `receivedAt`),
  INDEX `PlatformGatewayEvent_provider_status_received_idx`(`provider`, `status`, `receivedAt`),
  CONSTRAINT `PlatformGatewayEvent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TenantSuspensionRecord` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `reason` ENUM('NON_PAYMENT', 'REQUESTED_BY_TENANT', 'SECURITY', 'TERMS_VIOLATION', 'COMPLIANCE', 'ADMINISTRATIVE', 'OTHER') NOT NULL,
  `notes` TEXT NULL,
  `effectiveAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `suspendedAt` DATETIME(3) NULL,
  `suspendedById` VARCHAR(191) NULL,
  `autoReinstate` BOOLEAN NOT NULL DEFAULT false,
  `reinstatedAt` DATETIME(3) NULL,
  `reinstatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `TenantSuspensionRecord_tenant_reinstated_effective_idx`(`tenantId`, `reinstatedAt`, `effectiveAt`),
  INDEX `TenantSuspensionRecord_reason_effective_idx`(`reason`, `effectiveAt`),
  CONSTRAINT `TenantSuspensionRecord_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
