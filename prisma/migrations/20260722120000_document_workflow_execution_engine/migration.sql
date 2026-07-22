-- Add the workflow-execution lifecycle, document-fee payment linkage, and
-- household-member validation markers without rewriting historical rows.

ALTER TABLE `DocumentRequest`
  MODIFY `status` ENUM(
    'DRAFT',
    'SUBMITTED',
    'PAYMENT_PENDING',
    'PENDING_PAYMENT',
    'PAYMENT_CONFIRMED',
    'PENDING_APPROVAL',
    'UNDER_REVIEW',
    'RETURNED_FOR_CORRECTION',
    'APPROVED',
    'GENERATING',
    'ISSUED',
    'REJECTED',
    'READY_FOR_DOWNLOAD',
    'GENERATED',
    'DOWNLOADED',
    'CANCELLED',
    'REVOKED'
  ) NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN `issuedAt` DATETIME(3) NULL;

ALTER TABLE `DocumentRequestHistory`
  MODIFY `status` ENUM(
    'DRAFT',
    'SUBMITTED',
    'PAYMENT_PENDING',
    'PENDING_PAYMENT',
    'PAYMENT_CONFIRMED',
    'PENDING_APPROVAL',
    'UNDER_REVIEW',
    'RETURNED_FOR_CORRECTION',
    'APPROVED',
    'GENERATING',
    'ISSUED',
    'REJECTED',
    'READY_FOR_DOWNLOAD',
    'GENERATED',
    'DOWNLOADED',
    'CANCELLED',
    'REVOKED'
  ) NOT NULL;

ALTER TABLE `PaymentRequest`
  MODIFY `type` ENUM('MONTHLY_DUES', 'OTHER_COLLECTION', 'DOCUMENT_FEE') NOT NULL,
  ADD COLUMN `documentRequestId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `PaymentRequest_tenant_documentRequest_key` (`tenantId`, `documentRequestId`),
  ADD INDEX `PaymentRequest_tenant_document_request_idx` (`tenantId`, `documentRequestId`);

ALTER TABLE `PaymentRequest`
  ADD CONSTRAINT `PaymentRequest_documentRequest_fkey`
    FOREIGN KEY (`tenantId`, `documentRequestId`) REFERENCES `DocumentRequest` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `HouseholdMember`
  ADD COLUMN `validatedAt` DATETIME(3) NULL,
  ADD COLUMN `validatedById` VARCHAR(191) NULL,
  ADD COLUMN `revokedAt` DATETIME(3) NULL,
  ADD COLUMN `revokedById` VARCHAR(191) NULL,
  ADD INDEX `HouseholdMember_tenant_homeowner_validated_idx` (`tenantId`, `homeownerId`, `active`, `validatedAt`, `revokedAt`);
