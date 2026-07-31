-- Additive remediation for Complaint Management MVP privacy/workflow gaps.
-- Non-destructive: preserves existing complaint rows and tenant settings.
ALTER TABLE `Complaint`
  ADD COLUMN `requestedAction` TEXT NULL;

ALTER TABLE `ComplaintSetting`
  ADD COLUMN `identityRevealRoles` VARCHAR(300) NOT NULL DEFAULT 'ADMIN,HOA_ADMIN,SYSTEM_ADMIN';
