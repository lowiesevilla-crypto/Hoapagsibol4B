-- Add safe document-event metadata and deduplication keys to the existing
-- notification log. Existing notification rows remain unchanged.

ALTER TABLE `NotificationLog`
  MODIFY COLUMN `type` ENUM('ANNOUNCEMENT', 'BILL_REMINDER', 'PASSWORD_RESET', 'WELCOME', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED', 'PAYMENT_CONFIRMATION', 'BILLING_NOTIFICATION', 'TEST_EMAIL', 'EVENT', 'DOCUMENT_REQUEST_SUBMITTED', 'DOCUMENT_APPROVAL_REQUIRED', 'DOCUMENT_READY_FOR_DOWNLOAD', 'DOCUMENT_RELEASED', 'DOCUMENT_REVOKED', 'DOCUMENT_RETURNED') NOT NULL,
  ADD COLUMN `entityType` VARCHAR(191) NULL,
  ADD COLUMN `entityId` VARCHAR(191) NULL,
  ADD COLUMN `eventKey` VARCHAR(191) NULL,
  ADD COLUMN `metadata` JSON NULL,
  ADD INDEX `NotificationLog_tenant_recipient_event_idx` (`tenantId`, `recipientId`, `eventKey`),
  ADD INDEX `NotificationLog_tenant_entity_idx` (`tenantId`, `entityType`, `entityId`);
