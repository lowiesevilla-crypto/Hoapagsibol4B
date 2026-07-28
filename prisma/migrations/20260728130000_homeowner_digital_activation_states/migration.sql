-- Separate operational homeowner status from digital authentication activation status.

ALTER TABLE `HomeownerProfile`
  MODIFY `activationStatus` ENUM(
    'NOT_INVITED',
    'INVITATION_SENT',
    'ACTIVATION_IN_PROGRESS',
    'EMAIL_PENDING_VERIFICATION',
    'PASSWORD_CREATION_REQUIRED',
    'ACTIVE',
    'EXPIRED',
    'CANCELLED',
    'DISABLED',
    'PENDING_ACTIVATION'
  ) NOT NULL DEFAULT 'NOT_INVITED';

UPDATE `HomeownerProfile`
SET `activationStatus` = 'NOT_INVITED'
WHERE `activationStatus` = 'ACTIVE'
  AND `activatedAt` IS NULL;

UPDATE `HomeownerProfile`
SET `activationStatus` = 'INVITATION_SENT'
WHERE `activationStatus` = 'PENDING_ACTIVATION'
  AND `activatedAt` IS NULL;
