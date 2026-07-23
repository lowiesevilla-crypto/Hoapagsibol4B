-- Add the explicit homeowner correction state without rewriting historical rows.
ALTER TABLE `DocumentRequest`
  MODIFY `status` ENUM(
    'DRAFT',
    'SUBMITTED',
    'PAYMENT_PENDING',
    'PENDING_APPROVAL',
    'UNDER_REVIEW',
    'RETURNED_FOR_CORRECTION',
    'APPROVED',
    'REJECTED',
    'READY_FOR_DOWNLOAD',
    'GENERATED',
    'DOWNLOADED',
    'CANCELLED'
  ) NOT NULL DEFAULT 'SUBMITTED';

ALTER TABLE `DocumentRequestHistory`
  MODIFY `status` ENUM(
    'DRAFT',
    'SUBMITTED',
    'PAYMENT_PENDING',
    'PENDING_APPROVAL',
    'UNDER_REVIEW',
    'RETURNED_FOR_CORRECTION',
    'APPROVED',
    'REJECTED',
    'READY_FOR_DOWNLOAD',
    'GENERATED',
    'DOWNLOADED',
    'CANCELLED'
  ) NOT NULL;

-- Add the Certificate-specific lifecycle notification without changing existing values.
ALTER TABLE `NotificationLog`
  MODIFY `type` ENUM(
    'ANNOUNCEMENT',
    'BILL_REMINDER',
    'PASSWORD_RESET',
    'WELCOME',
    'DOCUMENT_APPROVED',
    'DOCUMENT_REJECTED',
    'PAYMENT_CONFIRMATION',
    'BILLING_NOTIFICATION',
    'TEST_EMAIL',
    'EVENT',
    'DOCUMENT_REQUEST_SUBMITTED',
    'DOCUMENT_APPROVAL_REQUIRED',
    'DOCUMENT_READY_FOR_DOWNLOAD',
    'DOCUMENT_RELEASED',
    'DOCUMENT_REVOKED',
    'DOCUMENT_RETURNED',
    'DOCUMENT_REISSUED'
  ) NOT NULL;
