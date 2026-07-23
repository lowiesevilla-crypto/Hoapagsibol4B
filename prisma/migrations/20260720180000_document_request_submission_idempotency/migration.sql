-- A browser-generated key makes homeowner document submission idempotent
-- without changing any historical request.
ALTER TABLE `DocumentRequest`
  ADD COLUMN `submissionKey` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `DocumentRequest_tenantId_submissionKey_key`
  ON `DocumentRequest`(`tenantId`, `submissionKey`);
