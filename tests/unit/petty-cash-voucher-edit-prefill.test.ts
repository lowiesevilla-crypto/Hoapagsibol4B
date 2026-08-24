import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const form = readFileSync(resolve(process.cwd(), "components/petty-cash-voucher-edit-form.tsx"), "utf8");

test("Petty Cash edit keeps the saved payee visible and preselected beyond the first 100 search options", () => {
  assert.match(form, /const resolvedInitialPayee =/);
  assert.match(form, /const initialSelectedPayeeId = resolvedInitialPayee\?\.id \|\| initial\.payeeEntityId/);
  assert.match(form, /useState\(initialPayeeQuery\)/);
  assert.match(form, /useState\(initialSelectedPayeeId\)/);
  assert.match(form, /keepSelectedVisible\(searchedPayees, currentPayees, payeeEntityId\)/);
  assert.match(form, /sameName\.length === 1 \? sameName\[0\] : undefined/);
});

test("pressing Enter in payee search selects a match and never submits the voucher", () => {
  assert.match(form, /function selectPayeeFromSearch\(event: KeyboardEvent<HTMLInputElement>\)/);
  assert.match(form, /event\.preventDefault\(\)/);
  assert.match(form, /event\.stopPropagation\(\)/);
  assert.match(form, /const match = searchedPayees\[0\]/);
  assert.match(form, /if \(match\) selectPayee\(match\.id\)/);
  assert.match(form, /onKeyDown=\{selectPayeeFromSearch\}/);
  assert.match(form, /only Save voucher changes submits the voucher/);
});

test("Employee Cash Advance edit uses the same prefill and Enter-to-select protection", () => {
  assert.match(form, /const initialEmployee = employees\.find\(\(item\) => item\.id === initial\.employeeId\)/);
  assert.match(form, /keepSelectedVisible\(searchedEmployees, employees, employeeAdvanceEmployeeId\)/);
  assert.match(form, /function selectEmployeeFromSearch\(event: KeyboardEvent<HTMLInputElement>\)/);
  assert.match(form, /if \(match\) selectEmployee\(match\.id\)/);
  assert.match(form, /onKeyDown=\{selectEmployeeFromSearch\}/);
});
