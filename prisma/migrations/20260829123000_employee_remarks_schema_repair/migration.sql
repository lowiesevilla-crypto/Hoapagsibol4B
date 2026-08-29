-- Production schema repair for the managed-production employee table.
--
-- The production Employee save path currently writes a nullable `remarks`
-- column to the legacy/mapped `employees` table. Some active tenant databases
-- predate that column, which causes MySQL error 1054. Fresh CI databases use
-- the canonical Prisma `EmployeeProfile` table and therefore do not contain
-- the legacy `employees` table.
--
-- Keep this repair additive and idempotent: alter only an existing `employees`
-- table that is missing `remarks`; otherwise make no schema change.

SET @employees_table_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
);

SET @employee_remarks_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'remarks'
);

SET @employee_remarks_sql = IF(
  @employees_table_exists > 0 AND @employee_remarks_exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `remarks` VARCHAR(191) NULL',
  'SELECT 1'
);

PREPARE employee_remarks_stmt FROM @employee_remarks_sql;
EXECUTE employee_remarks_stmt;
DEALLOCATE PREPARE employee_remarks_stmt;
