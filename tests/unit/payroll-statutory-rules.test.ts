import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
  calculateStatutoryContributions,
  calculateWithholdingTax,
  parsePhilippineStatutoryRules,
  payrollPolicyFromStatutoryRules,
  type PhilippineStatutoryRulesV1,
} from "../../lib/services/payroll-statutory";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260824180000_payroll_statutory_rules/migration.sql"), "utf8");
const payrollActions = readFileSync(resolve(process.cwd(), "lib/actions/payroll.ts"), "utf8");

const rules: PhilippineStatutoryRulesV1 = {
  schemaVersion: 1,
  labor: {
    standardHoursPerDay: 8,
    ordinaryOvertimeMultiplier: 1.25,
    nonOrdinaryOvertimeMultiplier: 1.3,
    nightDifferentialRate: 0.1,
    restDayMultiplier: 1.3,
    specialNonWorkingDayMultiplier: 1.3,
    specialNonWorkingRestDayMultiplier: 1.5,
    specialWorkingDayMultiplier: 1,
    regularHolidayMultiplier: 2,
    regularHolidayRestDayMultiplier: 2.6,
    hoaDeclaredHolidayMultiplier: 1,
  },
  sss: {
    monthlySalaryCreditMinimum: 5000,
    monthlySalaryCreditMaximum: 35000,
    monthlySalaryCreditStep: 500,
    employeeRate: 0.05,
    employerRate: 0.1,
    employeeCompensationLow: 10,
    employeeCompensationHigh: 30,
    employeeCompensationThreshold: 14500,
  },
  philHealth: {
    monthlyBasicSalaryFloor: 10000,
    monthlyBasicSalaryCeiling: 100000,
    premiumRate: 0.05,
    employeeShareRate: 0.5,
  },
  pagIbig: {
    monthlyFundSalaryCeiling: 10000,
    employeeRateAtOrBelowThreshold: 0.01,
    employeeRateAboveThreshold: 0.02,
    employeeRateThreshold: 1500,
    employerRate: 0.02,
  },
  withholdingTax: {
    semiMonthly: [
      { over: 0, base: 0, rate: 0 },
      { over: 10417, base: 0, rate: 0.15 },
      { over: 16667, base: 937.5, rate: 0.2 },
      { over: 33333, base: 4270.7, rate: 0.25 },
      { over: 83333, base: 16770.7, rate: 0.3 },
      { over: 333333, base: 91770.7, rate: 0.35 },
    ],
    monthly: [
      { over: 0, base: 0, rate: 0 },
      { over: 20833, base: 0, rate: 0.15 },
      { over: 33333, base: 1875, rate: 0.2 },
      { over: 66667, base: 8541.8, rate: 0.25 },
      { over: 166667, base: 33541.8, rate: 0.3 },
      { over: 666667, base: 183541.8, rate: 0.35 },
    ],
  },
};

test("PAY-STAT-001: persisted rules parse into a deterministic labor calculation policy", () => {
  const parsed = parsePhilippineStatutoryRules(rules as unknown as Prisma.JsonValue);
  const policy = payrollPolicyFromStatutoryRules("PH_TEST", parsed);
  assert.equal(policy.regularHolidayMultiplier, 2);
  assert.equal(policy.regularHolidayRestDayMultiplier, 2.6);
  assert.equal(policy.specialNonWorkingRestDayMultiplier, 1.5);
  assert.equal(policy.nightDifferentialRate, 0.1);
});

test("PAY-STAT-001: SSS, PhilHealth, Pag-IBIG and withholding split correctly for semi-monthly payroll", () => {
  const result = calculateStatutoryContributions({
    monthlyBasicSalary: 30000,
    grossPay: 15000,
    payFrequency: "SEMI_MONTHLY",
    rules,
  });

  assert.equal(result.sssMonthlySalaryCredit, 30000);
  assert.equal(result.sssEmployeeContribution, 750);
  assert.equal(result.sssEmployerContribution, 1500);
  assert.equal(result.employeeCompensationContribution, 15);
  assert.equal(result.philHealthEmployeeContribution, 375);
  assert.equal(result.philHealthEmployerContribution, 375);
  assert.equal(result.pagIbigEmployeeContribution, 100);
  assert.equal(result.pagIbigEmployerContribution, 100);
  assert.equal(result.taxableCompensation, 13775);
  assert.equal(result.withholdingTax, 503.7);
  assert.equal(result.statutoryDeduction, 1728.7);
  assert.equal(result.employerContribution, 1990);
});

test("PAY-STAT-001: contribution and withholding boundaries follow the effective tables", () => {
  const sssBoundary = calculateStatutoryContributions({ monthlyBasicSalary: 5250, grossPay: 5250, payFrequency: "MONTHLY", rules });
  assert.equal(sssBoundary.sssMonthlySalaryCredit, 5500);
  assert.equal(calculateWithholdingTax(10417, rules.withholdingTax.semiMonthly), 0);
  assert.equal(calculateWithholdingTax(16667, rules.withholdingTax.semiMonthly), 937.5);
  assert.equal(calculateWithholdingTax(33333, rules.withholdingTax.semiMonthly), 4270.7);
});

test("PAY-STAT-002: schema, migration and finalization retain immutable statutory evidence", () => {
  assert.match(schema, /model PayrollStatutoryRuleSet/);
  assert.match(schema, /statutoryRuleSnapshot\s+Json\?/);
  assert.match(schema, /statutorySnapshot\s+Json\?/);
  assert.match(migration, /SSS_Circular|Circular No\. 2024-006|2025-SSS-Contribution-Table/);
  assert.match(migration, /Annex%20E%20RR%2011-2018/);
  assert.match(payrollActions, /No verified Philippine statutory rule set applies/);
  assert.match(payrollActions, /Every payslip must retain the statutory rule set/);
  assert.match(payrollActions, /statutoryRuleSnapshot/);
});
