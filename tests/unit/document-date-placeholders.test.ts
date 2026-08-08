import assert from "node:assert/strict";
import { test } from "node:test";

import {
  documentIssueDayOrdinal,
  documentIssueMonthYear,
} from "@/lib/services/document-date-placeholders";

function localDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

test("formats certificate issue ordinal days including teen exceptions", () => {
  const cases: Array<[number, string]> = [
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [31, "31st"],
  ];

  for (const [day, expected] of cases) {
    assert.equal(documentIssueDayOrdinal(localDate(2026, 7, day)), expected);
  }
});

test("formats the certificate issue month and year independently of the ordinal day", () => {
  assert.equal(documentIssueMonthYear(localDate(2026, 7, 8)), "August 2026");
  assert.equal(documentIssueMonthYear(localDate(2027, 0, 1)), "January 2027");
});

test("invalid issue dates resolve blank instead of inventing date fragments", () => {
  assert.equal(documentIssueDayOrdinal("not-a-date"), "");
  assert.equal(documentIssueMonthYear("not-a-date"), "");
});
