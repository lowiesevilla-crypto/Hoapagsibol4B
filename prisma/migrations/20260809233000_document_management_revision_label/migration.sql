ALTER TABLE `RepositoryDocument`
  ADD COLUMN `currentRevisionLabel` VARCHAR(60) NULL AFTER `currentRevision`;
