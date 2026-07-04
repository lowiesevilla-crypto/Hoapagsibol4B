ALTER TABLE `User`
  ADD INDEX `User_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `User_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `HomeownerProfile`
  ADD INDEX `HomeownerProfile_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `HomeownerProfile_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ContractorProfile`
  ADD INDEX `ContractorProfile_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `ContractorProfile_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Bill`
  ADD INDEX `Bill_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `Bill_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DuesExemption`
  ADD INDEX `DuesExemption_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `DuesExemption_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Payment`
  ADD INDEX `Payment_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `Payment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PaymentArchive`
  ADD INDEX `PaymentArchive_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `PaymentArchive_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Collection`
  ADD INDEX `Collection_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `Collection_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Vehicle`
  ADD INDEX `Vehicle_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `Vehicle_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `BondRefund`
  ADD INDEX `BondRefund_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `BondRefund_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ReceiptCounter`
  ADD INDEX `ReceiptCounter_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `ReceiptCounter_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DataMigration`
  ADD INDEX `DataMigration_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `DataMigration_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentTemplate`
  ADD INDEX `DocumentTemplate_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `DocumentTemplate_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentRequest`
  ADD INDEX `DocumentRequest_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `DocumentRequest_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentVersion`
  ADD INDEX `DocumentVersion_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `DocumentVersion_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OrganizationOfficer`
  ADD INDEX `OrganizationOfficer_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `OrganizationOfficer_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OrganizationOfficerHistory`
  ADD INDEX `OrganizationOfficerHistory_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `OrganizationOfficerHistory_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentRequestHistory`
  ADD INDEX `DocumentRequestHistory_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `DocumentRequestHistory_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentCounter`
  ADD INDEX `DocumentCounter_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `DocumentCounter_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `EmployeeProfile`
  ADD INDEX `EmployeeProfile_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `EmployeeProfile_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PayrollDeductionType`
  ADD INDEX `PayrollDeductionType_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `PayrollDeductionType_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `EmployeeLoan`
  ADD INDEX `EmployeeLoan_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `EmployeeLoan_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Attendance`
  ADD INDEX `Attendance_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `Attendance_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PayrollAccess`
  ADD INDEX `PayrollAccess_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `PayrollAccess_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `AuditLog`
  ADD INDEX `AuditLog_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `AuditLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PayrollCalendarDay`
  ADD INDEX `PayrollCalendarDay_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `PayrollCalendarDay_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `EmployeeSchedule`
  ADD INDEX `EmployeeSchedule_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `EmployeeSchedule_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `AttendanceAdjustment`
  ADD INDEX `AttendanceAdjustment_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `AttendanceAdjustment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OvertimeRecord`
  ADD INDEX `OvertimeRecord_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `OvertimeRecord_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PayrollPeriod`
  ADD INDEX `PayrollPeriod_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `PayrollPeriod_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PayrollArchive`
  ADD INDEX `PayrollArchive_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `PayrollArchive_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PayrollDeduction`
  ADD INDEX `PayrollDeduction_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `PayrollDeduction_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Payslip`
  ADD INDEX `Payslip_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `Payslip_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ExpenseCategory`
  ADD INDEX `ExpenseCategory_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `ExpenseCategory_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Expense`
  ADD INDEX `Expense_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `Expense_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Announcement`
  ADD INDEX `Announcement_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `Announcement_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Event`
  ADD INDEX `Event_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `Event_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `NotificationLog`
  ADD INDEX `NotificationLog_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `NotificationLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PasswordResetToken`
  ADD INDEX `PasswordResetToken_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `PasswordResetToken_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PasswordResetAttempt`
  ADD INDEX `PasswordResetAttempt_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `PasswordResetAttempt_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SystemSetting`
  ADD INDEX `SystemSetting_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `SystemSetting_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PaymentRequest`
  ADD INDEX `PaymentRequest_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `PaymentRequest_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ChatConversation`
  ADD INDEX `ChatConversation_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `ChatConversation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ChatParticipant`
  ADD INDEX `ChatParticipant_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `ChatParticipant_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ChatMessage`
  ADD INDEX `ChatMessage_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `ChatMessage_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ChatAttachment`
  ADD INDEX `ChatAttachment_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `ChatAttachment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `UserPresence`
  ADD INDEX `UserPresence_tenantId_idx`(`tenantId`),
  ADD CONSTRAINT `UserPresence_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
