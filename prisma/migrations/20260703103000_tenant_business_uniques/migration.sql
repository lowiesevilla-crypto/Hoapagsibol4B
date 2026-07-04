ALTER TABLE `User`
  DROP INDEX `User_email_key`,
  DROP INDEX `User_username_key`,
  ADD UNIQUE INDEX `User_tenantId_email_key` (`tenantId`, `email`),
  ADD UNIQUE INDEX `User_tenantId_username_key` (`tenantId`, `username`);

ALTER TABLE `HomeownerProfile`
  DROP INDEX `HomeownerProfile_block_lot_key`,
  ADD UNIQUE INDEX `HomeownerProfile_tenantId_block_lot_key` (`tenantId`, `block`, `lot`);

ALTER TABLE `ContractorProfile`
  DROP INDEX `ContractorProfile_companyName_key`,
  ADD UNIQUE INDEX `ContractorProfile_tenantId_companyName_key` (`tenantId`, `companyName`);

ALTER TABLE `Payment`
  DROP INDEX `Payment_receiptNumber_key`,
  ADD UNIQUE INDEX `Payment_tenantId_receiptNumber_key` (`tenantId`, `receiptNumber`);

ALTER TABLE `Collection`
  DROP INDEX `Collection_receiptNumber_key`,
  ADD UNIQUE INDEX `Collection_tenantId_receiptNumber_key` (`tenantId`, `receiptNumber`);

ALTER TABLE `Vehicle`
  DROP INDEX `Vehicle_plateNumber_key`,
  DROP INDEX `Vehicle_stickerNumber_key`,
  ADD UNIQUE INDEX `Vehicle_tenantId_plateNumber_key` (`tenantId`, `plateNumber`),
  ADD UNIQUE INDEX `Vehicle_tenantId_stickerNumber_key` (`tenantId`, `stickerNumber`);

ALTER TABLE `ReceiptCounter`
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`tenantId`, `series`, `year`);

ALTER TABLE `DataMigration`
  DROP INDEX `DataMigration_dedupeKey_key`,
  ADD UNIQUE INDEX `DataMigration_tenantId_dedupeKey_key` (`tenantId`, `dedupeKey`);

ALTER TABLE `DocumentTemplate`
  DROP INDEX `DocumentTemplate_type_key`,
  ADD UNIQUE INDEX `DocumentTemplate_tenantId_type_key` (`tenantId`, `type`);

ALTER TABLE `DocumentRequest`
  DROP INDEX `DocumentRequest_documentNumber_key`,
  ADD UNIQUE INDEX `DocumentRequest_tenantId_documentNumber_key` (`tenantId`, `documentNumber`);

ALTER TABLE `DocumentCounter`
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`tenantId`, `type`, `year`);

ALTER TABLE `EmployeeProfile`
  DROP INDEX `EmployeeProfile_employeeNumber_key`,
  ADD UNIQUE INDEX `EmployeeProfile_tenantId_employeeNumber_key` (`tenantId`, `employeeNumber`);

ALTER TABLE `PayrollDeductionType`
  DROP INDEX `PayrollDeductionType_name_key`,
  ADD UNIQUE INDEX `PayrollDeductionType_tenantId_name_key` (`tenantId`, `name`);

ALTER TABLE `PayrollCalendarDay`
  DROP INDEX `PayrollCalendarDay_date_key`,
  ADD UNIQUE INDEX `PayrollCalendarDay_tenantId_date_key` (`tenantId`, `date`);

ALTER TABLE `PayrollPeriod`
  DROP INDEX `PayrollPeriod_startDate_endDate_key`,
  ADD UNIQUE INDEX `PayrollPeriod_tenantId_startDate_endDate_key` (`tenantId`, `startDate`, `endDate`);

ALTER TABLE `ExpenseCategory`
  DROP INDEX `ExpenseCategory_name_key`,
  ADD UNIQUE INDEX `ExpenseCategory_tenantId_name_key` (`tenantId`, `name`);

ALTER TABLE `SystemSetting`
  DROP INDEX `SystemSetting_category_key_key`,
  ADD UNIQUE INDEX `SystemSetting_tenantId_category_key_key` (`tenantId`, `category`, `key`);
