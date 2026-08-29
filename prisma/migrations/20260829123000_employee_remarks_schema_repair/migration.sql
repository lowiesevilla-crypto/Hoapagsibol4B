-- Production schema repair for EmployeeProfile.remarks.
--
-- Current Prisma runtime writes the nullable `remarks` field to the mapped
-- `employees` table. Some already-running tenant databases predate that column,
-- which causes Employee create/edit to fail with MySQL error 1054.
--
-- Keep this additive and idempotent so environments that already received the
-- column through an earlier schema-sync path remain safe when migration history
-- is reconciled.

SET @employee_remarks_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'remarks'
);

SET @employee_remarks_sql = IF(
  @employee_remarks_exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `remarks` VARCHAR(191) NULL',
  'SELECT 1'
);

PREPARE employee_remarks_stmt FROM @employee_remarks_sql;
EXECUTE employee_remarks_stmt;
DEALLOCATE PREPARE employee_remarks_stmt;
