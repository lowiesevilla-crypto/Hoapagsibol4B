-- PAY-TASK-006 / PAY-STAT-001 / PAY-STAT-002
-- Persist authoritative effective-dated Philippine payroll rules. Historical
-- payroll calculated before this migration intentionally remains unlinked: it
-- used the named legacy compatibility policy and must not be relabeled as if it
-- had used these verified rules.

CREATE TABLE `PayrollStatutoryRuleSet` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(80) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `jurisdiction` VARCHAR(20) NOT NULL DEFAULT 'PH',
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `sourceSnapshot` JSON NOT NULL,
  `rules` JSON NOT NULL,
  `contentHash` VARCHAR(64) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `PayrollStatRule_code_key`(`code`),
  UNIQUE INDEX `PayrollStatRule_hash_key`(`contentHash`),
  INDEX `PayrollStatRule_effective_idx`(`jurisdiction`, `active`, `effectiveFrom`, `effectiveTo`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `PayrollStatutoryRuleSet` (
  `id`, `code`, `name`, `jurisdiction`, `effectiveFrom`, `effectiveTo`,
  `sourceSnapshot`, `rules`, `contentHash`, `active`
) VALUES (
  'ph_statutory_2025_2026_v1',
  'PH_STATUTORY_2025_2026_V1',
  'Philippine statutory payroll rules current from January 2025',
  'PH',
  '2025-01-01',
  NULL,
  JSON_OBJECT(
    'schemaVersion', 1,
    'verifiedAsOf', '2026-08-24',
    'reviewPolicy', 'Official government publication; effective until superseded by a later approved rule set.',
    'sources', JSON_ARRAY(
      JSON_OBJECT(
        'agency', 'Department of Labor and Employment / Bureau of Working Conditions',
        'document', 'Handbook on Workers Statutory Monetary Benefits, 2024 Edition',
        'url', 'https://nwpc.dole.gov.ph/wp-content/uploads/2024/11/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf',
        'appliesTo', JSON_ARRAY('ordinary overtime', 'rest day', 'holiday', 'night differential')
      ),
      JSON_OBJECT(
        'agency', 'Bureau of Internal Revenue',
        'document', 'Revenue Regulations No. 11-2018, Annex E',
        'url', 'https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf',
        'effectiveFrom', '2023-01-01',
        'appliesTo', JSON_ARRAY('compensation withholding tax')
      ),
      JSON_OBJECT(
        'agency', 'Social Security System',
        'document', 'Circular No. 2024-006',
        'url', 'https://www.sss.gov.ph/wp-content/uploads/2024/12/2025-SSS-Contribution-Table-rev.pdf',
        'effectiveFrom', '2025-01-01',
        'appliesTo', JSON_ARRAY('SS', 'EC', 'MPF')
      ),
      JSON_OBJECT(
        'agency', 'Philippine Health Insurance Corporation',
        'document', 'Advisory No. 2025-0002 and official employer contribution table',
        'url', 'https://www.philhealth.gov.ph/advisories/2025/PA2025-0002.pdf',
        'effectiveFrom', '2025-01-01',
        'appliesTo', JSON_ARRAY('direct contributor premium')
      ),
      JSON_OBJECT(
        'agency', 'Home Development Mutual Fund / Pag-IBIG Fund',
        'document', 'Circular No. 460',
        'url', 'https://www.dbm.gov.ph/index.php/circular-letters?catid=335&id=2569:circular-letter-no-2024-2&view=article',
        'effectiveFrom', '2024-02-01',
        'appliesTo', JSON_ARRAY('employee savings', 'employer counterpart')
      )
    )
  ),
  JSON_OBJECT(
    'schemaVersion', 1,
    'labor', JSON_OBJECT(
      'standardHoursPerDay', 8,
      'ordinaryOvertimeMultiplier', 1.25,
      'nonOrdinaryOvertimeMultiplier', 1.30,
      'nightDifferentialRate', 0.10,
      'restDayMultiplier', 1.30,
      'specialNonWorkingDayMultiplier', 1.30,
      'specialNonWorkingRestDayMultiplier', 1.50,
      'specialWorkingDayMultiplier', 1.00,
      'regularHolidayMultiplier', 2.00,
      'regularHolidayRestDayMultiplier', 2.60,
      'hoaDeclaredHolidayMultiplier', 1.00
    ),
    'sss', JSON_OBJECT(
      'monthlySalaryCreditMinimum', 5000,
      'monthlySalaryCreditMaximum', 35000,
      'monthlySalaryCreditStep', 500,
      'employeeRate', 0.05,
      'employerRate', 0.10,
      'employeeCompensationLow', 10,
      'employeeCompensationHigh', 30,
      'employeeCompensationThreshold', 14500
    ),
    'philHealth', JSON_OBJECT(
      'monthlyBasicSalaryFloor', 10000,
      'monthlyBasicSalaryCeiling', 100000,
      'premiumRate', 0.05,
      'employeeShareRate', 0.50
    ),
    'pagIbig', JSON_OBJECT(
      'monthlyFundSalaryCeiling', 10000,
      'employeeRateAtOrBelowThreshold', 0.01,
      'employeeRateAboveThreshold', 0.02,
      'employeeRateThreshold', 1500,
      'employerRate', 0.02
    ),
    'withholdingTax', JSON_OBJECT(
      'semiMonthly', JSON_ARRAY(
        JSON_OBJECT('over', 0, 'base', 0, 'rate', 0),
        JSON_OBJECT('over', 10417, 'base', 0, 'rate', 0.15),
        JSON_OBJECT('over', 16667, 'base', 937.50, 'rate', 0.20),
        JSON_OBJECT('over', 33333, 'base', 4270.70, 'rate', 0.25),
        JSON_OBJECT('over', 83333, 'base', 16770.70, 'rate', 0.30),
        JSON_OBJECT('over', 333333, 'base', 91770.70, 'rate', 0.35)
      ),
      'monthly', JSON_ARRAY(
        JSON_OBJECT('over', 0, 'base', 0, 'rate', 0),
        JSON_OBJECT('over', 20833, 'base', 0, 'rate', 0.15),
        JSON_OBJECT('over', 33333, 'base', 1875.00, 'rate', 0.20),
        JSON_OBJECT('over', 66667, 'base', 8541.80, 'rate', 0.25),
        JSON_OBJECT('over', 166667, 'base', 33541.80, 'rate', 0.30),
        JSON_OBJECT('over', 666667, 'base', 183541.80, 'rate', 0.35)
      )
    )
  ),
  '0ab3cbdceb599a53063c55e2493e55775dc00e08d7d859201953733d65621c07',
  TRUE
);

ALTER TABLE `PayrollPeriod`
  ADD COLUMN `statutoryRuleSetId` VARCHAR(191) NULL,
  ADD INDEX `PayrollPeriod_stat_rule_idx`(`statutoryRuleSetId`);

ALTER TABLE `PayrollCalculationRevision`
  ADD COLUMN `statutoryRuleSetId` VARCHAR(191) NULL,
  ADD COLUMN `statutoryRuleSnapshot` JSON NULL,
  ADD INDEX `PayrollCalcRev_stat_rule_idx`(`statutoryRuleSetId`);

ALTER TABLE `Payslip`
  ADD COLUMN `statutoryRuleSetId` VARCHAR(191) NULL,
  ADD COLUMN `statutorySnapshot` JSON NULL,
  ADD COLUMN `sssEmployeeContribution` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `sssEmployerContribution` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `employeeCompensationContribution` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `philHealthEmployeeContribution` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `philHealthEmployerContribution` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `pagIbigEmployeeContribution` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `pagIbigEmployerContribution` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `withholdingTax` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `statutoryDeduction` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `employerContribution` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD INDEX `Payslip_stat_rule_idx`(`statutoryRuleSetId`);

ALTER TABLE `PayrollPeriod`
  ADD CONSTRAINT `PayrollPeriod_stat_rule_fk`
    FOREIGN KEY (`statutoryRuleSetId`) REFERENCES `PayrollStatutoryRuleSet`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PayrollCalculationRevision`
  ADD CONSTRAINT `PayrollCalcRev_stat_rule_fk`
    FOREIGN KEY (`statutoryRuleSetId`) REFERENCES `PayrollStatutoryRuleSet`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Payslip`
  ADD CONSTRAINT `Payslip_stat_rule_fk`
    FOREIGN KEY (`statutoryRuleSetId`) REFERENCES `PayrollStatutoryRuleSet`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
