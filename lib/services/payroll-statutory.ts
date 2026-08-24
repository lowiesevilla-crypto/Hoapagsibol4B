import type { PayFrequency, Prisma } from "@prisma/client";
import type { PayrollCalculationPolicy } from "@/lib/services/payroll";

type DecimalLike = number | string | { toString(): string };

export type WithholdingBracket = Readonly<{
  over: number;
  base: number;
  rate: number;
}>;

export type PhilippineStatutoryRulesV1 = Readonly<{
  schemaVersion: 1;
  labor: Readonly<{
    standardHoursPerDay: number;
    ordinaryOvertimeMultiplier: number;
    nonOrdinaryOvertimeMultiplier: number;
    nightDifferentialRate: number;
    restDayMultiplier: number;
    specialNonWorkingDayMultiplier: number;
    specialNonWorkingRestDayMultiplier: number;
    specialWorkingDayMultiplier: number;
    regularHolidayMultiplier: number;
    regularHolidayRestDayMultiplier: number;
    hoaDeclaredHolidayMultiplier: number;
  }>;
  sss: Readonly<{
    monthlySalaryCreditMinimum: number;
    monthlySalaryCreditMaximum: number;
    monthlySalaryCreditStep: number;
    employeeRate: number;
    employerRate: number;
    employeeCompensationLow: number;
    employeeCompensationHigh: number;
    employeeCompensationThreshold: number;
  }>;
  philHealth: Readonly<{
    monthlyBasicSalaryFloor: number;
    monthlyBasicSalaryCeiling: number;
    premiumRate: number;
    employeeShareRate: number;
  }>;
  pagIbig: Readonly<{
    monthlyFundSalaryCeiling: number;
    employeeRateAtOrBelowThreshold: number;
    employeeRateAboveThreshold: number;
    employeeRateThreshold: number;
    employerRate: number;
  }>;
  withholdingTax: Readonly<{
    semiMonthly: readonly WithholdingBracket[];
    monthly: readonly WithholdingBracket[];
  }>;
}>;

export type PayrollStatutoryRuleRecord = Readonly<{
  id: string;
  code: string;
  name: string;
  jurisdiction: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  sourceSnapshot: Prisma.JsonValue;
  rules: Prisma.JsonValue;
  contentHash: string;
}>;

export type StatutoryContributionResult = Readonly<{
  monthlyBasicSalary: number;
  sssMonthlySalaryCredit: number;
  sssEmployeeContribution: number;
  sssEmployerContribution: number;
  employeeCompensationContribution: number;
  philHealthEmployeeContribution: number;
  philHealthEmployerContribution: number;
  pagIbigEmployeeContribution: number;
  pagIbigEmployerContribution: number;
  withholdingTax: number;
  statutoryDeduction: number;
  employerContribution: number;
  taxableCompensation: number;
}>;

export type StatutoryApplicability = Readonly<{
  statutoryEnabled: boolean;
  sssEnabled: boolean;
  philHealthEnabled: boolean;
  pagIbigEnabled: boolean;
  withholdingTaxEnabled: boolean;
}>;

export const DEFAULT_STATUTORY_APPLICABILITY: StatutoryApplicability = Object.freeze({
  statutoryEnabled: true,
  sssEnabled: true,
  philHealthEnabled: true,
  pagIbigEnabled: true,
  withholdingTaxEnabled: true,
});

/**
 * @requirement PAY-STAT-003
 * @status IMPLEMENTED
 * @description Resolve tenant defaults and an optional employee override; the tenant master switch always remains authoritative.
 */
export function resolveStatutoryApplicability(
  tenantDefault?: StatutoryApplicability | null,
  employeeOverride?: StatutoryApplicability | null,
): StatutoryApplicability {
  const tenant = tenantDefault ?? DEFAULT_STATUTORY_APPLICABILITY;
  const employee = employeeOverride ?? DEFAULT_STATUTORY_APPLICABILITY;
  const statutoryEnabled = tenant.statutoryEnabled && employee.statutoryEnabled;
  return {
    statutoryEnabled,
    sssEnabled: statutoryEnabled && tenant.sssEnabled && employee.sssEnabled,
    philHealthEnabled: statutoryEnabled && tenant.philHealthEnabled && employee.philHealthEnabled,
    pagIbigEnabled: statutoryEnabled && tenant.pagIbigEnabled && employee.pagIbigEnabled,
    withholdingTaxEnabled: statutoryEnabled && tenant.withholdingTaxEnabled && employee.withholdingTaxEnabled,
  };
}

/**
 * @requirement PAY-STAT-001
 * @status IMPLEMENTED
 * @description Parse a persisted statutory rule set and fail closed when required legal inputs are absent or malformed.
 */
export function parsePhilippineStatutoryRules(value: Prisma.JsonValue): PhilippineStatutoryRulesV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The statutory rule set is malformed.");
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) throw new Error("The statutory rule set schema version is unsupported.");
  for (const section of ["labor", "sss", "philHealth", "pagIbig", "withholdingTax"] as const) {
    if (!candidate[section] || typeof candidate[section] !== "object" || Array.isArray(candidate[section])) {
      throw new Error(`The statutory rule set is missing ${section}.`);
    }
  }
  const parsed = candidate as unknown as PhilippineStatutoryRulesV1;
  const finiteNonNegative = (name: string, number: number, positive = false) => {
    if (!Number.isFinite(number) || number < 0 || (positive && number === 0)) throw new Error(`The statutory rule ${name} is invalid.`);
  };
  finiteNonNegative("labor.standardHoursPerDay", parsed.labor.standardHoursPerDay, true);
  if (parsed.labor.standardHoursPerDay > 24) throw new Error("The statutory standard workday cannot exceed 24 hours.");
  for (const [name, number] of Object.entries(parsed.labor)) finiteNonNegative(`labor.${name}`, Number(number), true);
  for (const [name, number] of Object.entries(parsed.sss)) finiteNonNegative(`sss.${name}`, Number(number), true);
  for (const [name, number] of Object.entries(parsed.philHealth)) finiteNonNegative(`philHealth.${name}`, Number(number), true);
  for (const [name, number] of Object.entries(parsed.pagIbig)) finiteNonNegative(`pagIbig.${name}`, Number(number), true);
  if (parsed.sss.monthlySalaryCreditMinimum > parsed.sss.monthlySalaryCreditMaximum) throw new Error("The SSS salary-credit range is invalid.");
  if (parsed.philHealth.monthlyBasicSalaryFloor > parsed.philHealth.monthlyBasicSalaryCeiling) throw new Error("The PhilHealth salary range is invalid.");
  validateBrackets("semiMonthly", parsed.withholdingTax.semiMonthly);
  validateBrackets("monthly", parsed.withholdingTax.monthly);
  return parsed;
}

/**
 * @requirement PAY-STAT-001 PAY-CALC-002
 * @status IMPLEMENTED
 * @description Convert the persisted labor section into the explicit calculation policy consumed by deterministic payroll math.
 */
export function payrollPolicyFromStatutoryRules(ruleCode: string, rules: PhilippineStatutoryRulesV1): PayrollCalculationPolicy {
  return {
    key: ruleCode,
    standardHoursPerDay: rules.labor.standardHoursPerDay,
    overtimeMultiplier: rules.labor.ordinaryOvertimeMultiplier,
    ordinaryOvertimeMultiplier: rules.labor.ordinaryOvertimeMultiplier,
    nonOrdinaryOvertimeMultiplier: rules.labor.nonOrdinaryOvertimeMultiplier,
    nightDifferentialRate: rules.labor.nightDifferentialRate,
    restDayPremiumRate: rules.labor.restDayMultiplier - 1,
    holidayPremiumRate: rules.labor.specialNonWorkingDayMultiplier - 1,
    restDayMultiplier: rules.labor.restDayMultiplier,
    specialNonWorkingDayMultiplier: rules.labor.specialNonWorkingDayMultiplier,
    specialNonWorkingRestDayMultiplier: rules.labor.specialNonWorkingRestDayMultiplier,
    specialWorkingDayMultiplier: rules.labor.specialWorkingDayMultiplier,
    regularHolidayMultiplier: rules.labor.regularHolidayMultiplier,
    regularHolidayRestDayMultiplier: rules.labor.regularHolidayRestDayMultiplier,
    hoaDeclaredHolidayMultiplier: rules.labor.hoaDeclaredHolidayMultiplier,
  };
}

/**
 * @requirement PAY-STAT-001 PAY-STAT-002 PAY-STAT-003
 * @status IMPLEMENTED
 * @description Calculate statutory employee deductions and employer liabilities from an explicit effective-dated rule snapshot.
 */
export function calculateStatutoryContributions(input: {
  monthlyBasicSalary: DecimalLike;
  grossPay: DecimalLike;
  payFrequency: PayFrequency | "SEMI_MONTHLY" | "MONTHLY";
  rules: PhilippineStatutoryRulesV1;
  applicability?: StatutoryApplicability;
}): StatutoryContributionResult {
  const monthlyBasicSalary = positiveMoney(input.monthlyBasicSalary, "Monthly basic salary");
  const grossPay = nonNegativeMoney(input.grossPay, "Gross pay");
  const periodsPerMonth = input.payFrequency === "SEMI_MONTHLY" ? 2 : 1;
  const sss = input.rules.sss;
  const philHealth = input.rules.philHealth;
  const pagIbig = input.rules.pagIbig;
  const applicability = resolveStatutoryApplicability(input.applicability);

  const sssMonthlySalaryCredit = resolveSssMonthlySalaryCredit(monthlyBasicSalary, sss);
  const sssEmployeeContribution = applicability.sssEnabled
    ? roundMoney(sssMonthlySalaryCredit * sss.employeeRate / periodsPerMonth)
    : 0;
  const sssEmployerContribution = applicability.sssEnabled
    ? roundMoney(sssMonthlySalaryCredit * sss.employerRate / periodsPerMonth)
    : 0;
  const employeeCompensationContribution = applicability.sssEnabled
    ? roundMoney((sssMonthlySalaryCredit <= sss.employeeCompensationThreshold ? sss.employeeCompensationLow : sss.employeeCompensationHigh) / periodsPerMonth)
    : 0;

  const philHealthSalary = clamp(monthlyBasicSalary, philHealth.monthlyBasicSalaryFloor, philHealth.monthlyBasicSalaryCeiling);
  const philHealthMonthlyPremium = philHealthSalary * philHealth.premiumRate;
  const philHealthEmployeeContribution = applicability.philHealthEnabled
    ? roundMoney(philHealthMonthlyPremium * philHealth.employeeShareRate / periodsPerMonth)
    : 0;
  const philHealthEmployerContribution = applicability.philHealthEnabled
    ? roundMoney((philHealthMonthlyPremium * (1 - philHealth.employeeShareRate)) / periodsPerMonth)
    : 0;

  const pagIbigSalary = Math.min(monthlyBasicSalary, pagIbig.monthlyFundSalaryCeiling);
  const pagIbigEmployeeRate = monthlyBasicSalary <= pagIbig.employeeRateThreshold
    ? pagIbig.employeeRateAtOrBelowThreshold
    : pagIbig.employeeRateAboveThreshold;
  const pagIbigEmployeeContribution = applicability.pagIbigEnabled
    ? roundMoney(pagIbigSalary * pagIbigEmployeeRate / periodsPerMonth)
    : 0;
  const pagIbigEmployerContribution = applicability.pagIbigEnabled
    ? roundMoney(pagIbigSalary * pagIbig.employerRate / periodsPerMonth)
    : 0;

  const mandatoryEmployeeContributions = roundMoney(
    sssEmployeeContribution + philHealthEmployeeContribution + pagIbigEmployeeContribution,
  );
  const taxableCompensation = roundMoney(Math.max(0, grossPay - mandatoryEmployeeContributions));
  const brackets = input.payFrequency === "SEMI_MONTHLY"
    ? input.rules.withholdingTax.semiMonthly
    : input.rules.withholdingTax.monthly;
  const withholdingTax = applicability.withholdingTaxEnabled
    ? calculateWithholdingTax(taxableCompensation, brackets)
    : 0;
  const statutoryDeduction = roundMoney(mandatoryEmployeeContributions + withholdingTax);
  const employerContribution = roundMoney(
    sssEmployerContribution
      + employeeCompensationContribution
      + philHealthEmployerContribution
      + pagIbigEmployerContribution,
  );

  return {
    monthlyBasicSalary,
    sssMonthlySalaryCredit,
    sssEmployeeContribution,
    sssEmployerContribution,
    employeeCompensationContribution,
    philHealthEmployeeContribution,
    philHealthEmployerContribution,
    pagIbigEmployeeContribution,
    pagIbigEmployerContribution,
    withholdingTax,
    statutoryDeduction,
    employerContribution,
    taxableCompensation,
  };
}

/**
 * @requirement PAY-STAT-001 PAY-STAT-002
 * @status IMPLEMENTED
 * @description Apply the effective payroll-frequency withholding table captured in the statutory rule snapshot.
 */
export function calculateWithholdingTax(taxableCompensation: number, brackets: readonly WithholdingBracket[]) {
  const amount = nonNegativeMoney(taxableCompensation, "Taxable compensation");
  let bracket = brackets[0];
  for (const candidate of brackets) {
    if (amount >= candidate.over) bracket = candidate;
    else break;
  }
  if (!bracket) throw new Error("The withholding-tax table is empty.");
  return roundMoney(bracket.base + Math.max(0, amount - bracket.over) * bracket.rate);
}

function resolveSssMonthlySalaryCredit(monthlyBasicSalary: number, rules: PhilippineStatutoryRulesV1["sss"]) {
  const clamped = clamp(monthlyBasicSalary, rules.monthlySalaryCreditMinimum, rules.monthlySalaryCreditMaximum);
  const steps = Math.floor(
    (clamped - rules.monthlySalaryCreditMinimum + rules.monthlySalaryCreditStep / 2) / rules.monthlySalaryCreditStep,
  );
  return clamp(
    rules.monthlySalaryCreditMinimum + steps * rules.monthlySalaryCreditStep,
    rules.monthlySalaryCreditMinimum,
    rules.monthlySalaryCreditMaximum,
  );
}

function validateBrackets(name: string, brackets: readonly WithholdingBracket[]) {
  if (!Array.isArray(brackets) || !brackets.length) throw new Error(`The ${name} withholding table is empty.`);
  let previous = -1;
  for (const bracket of brackets) {
    finiteBracketValue(name, "over", bracket.over);
    finiteBracketValue(name, "base", bracket.base);
    finiteBracketValue(name, "rate", bracket.rate);
    if (bracket.over <= previous) throw new Error(`The ${name} withholding thresholds are not strictly increasing.`);
    previous = bracket.over;
  }
}

function finiteBracketValue(table: string, field: string, value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`The ${table} withholding ${field} value is invalid.`);
}

function positiveMoney(value: DecimalLike, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be greater than zero.`);
  return roundMoney(number);
}

function nonNegativeMoney(value: DecimalLike, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} cannot be negative.`);
  return roundMoney(number);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
