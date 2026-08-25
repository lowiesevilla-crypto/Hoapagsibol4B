import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const form = readFileSync(resolve(process.cwd(), "components/petty-cash-voucher-edit-form.tsx"), "utf8");
const editPage = readFileSync(resolve(process.cwd(), "app/admin/petty-cash/[id]/edit/page.tsx"), "utf8");

test("Petty Cash edit keeps the saved payee visible and preselected beyond the first 100 search options", () => {
  assert.match(form, /const resolvedInitialPayee =/);
  assert.match(form, /const initialSelectedPayeeId = resolvedInitialPayee\?\.id \|\| initial\.payeeEntityId/);
  assert.match(form, /useState\(initialPayeeQuery\)/);
  assert.match(form, /useState\(initialSelectedPayeeId\)/);
  assert.match(form, /keepSelectedVisible\(searchedPayees, currentPayees, payeeEntityId\)/);
  assert.match(form, /sameName\.length === 1 \? sameName\[0\] : undefined/);
});

test("Petty Cash edit explicitly hydrates saved directory records beyond server-side result caps", () => {
  assert.match(editPage, /function prependMissingById<T extends \{ id: string \}>/);
  assert.match(editPage, /const currentEmployeeIds = Array\.from\(new Set/);
  assert.match(editPage, /const missingEmployeeIds = currentEmployeeIds\.filter/);
  assert.match(editPage, /id: \{ in: missingEmployeeIds \}/);
  assert.match(editPage, /where: \{ id: currentHomeownerId, tenantId: admin\.tenantId \}/);
  assert.match(editPage, /where: \{ id: currentContractorId, tenantId: admin\.tenantId \}/);
  assert.match(editPage, /WHERE tenantId=\$\{admin\.tenantId\} AND id=\$\{currentRenterId\}/);
  assert.match(editPage, /const homeownerRows = prependMissingById\(homeowners, currentHomeowner \? \[currentHomeowner\] : \[\]\)/);
  assert.match(editPage, /const renterRows = prependMissingById\(renters, currentRenters\)/);
});

test("Petty Cash edit also restores saved particulars and approver outside bounded active lists", () => {
  assert.match(editPage, /const missingCategoryIds = currentCategoryIds\.filter/);
  assert.match(editPage, /id: \{ in: missingCategoryIds \}/);
  assert.match(editPage, /where: \{ id: currentOfficerId, tenantId: admin\.tenantId \}/);
  assert.match(editPage, /expenseTypes=\{expenseTypeRows\.map/);
  assert.match(editPage, /officers=\{officerRows\.map/);
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
