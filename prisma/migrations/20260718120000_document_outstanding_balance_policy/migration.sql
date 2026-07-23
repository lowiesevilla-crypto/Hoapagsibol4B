ALTER TABLE `DocumentDefinition`
  ADD COLUMN `outstandingBalancePolicy` ENUM('IGNORE_BALANCE', 'BLOCK_DOWNLOAD', 'BLOCK_REQUEST', 'ALLOW_ADMIN_OVERRIDE') NOT NULL DEFAULT 'BLOCK_DOWNLOAD' AFTER `homeownerDownloadEnabled`;

UPDATE `DocumentDefinition`
SET `outstandingBalancePolicy` = 'BLOCK_DOWNLOAD'
WHERE `outstandingBalancePolicy` IS NULL;
