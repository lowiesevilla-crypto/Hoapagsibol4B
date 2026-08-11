import assert from "node:assert/strict";
import test from "node:test";
import { manilaDayPeriod } from "../../lib/utils";

test("uses Asia/Manila greeting boundaries regardless of server timezone", () => {
  assert.equal(manilaDayPeriod("2026-08-10T21:00:00.000Z"), "Morning"); // 05:00 PHT
  assert.equal(manilaDayPeriod("2026-08-11T03:59:00.000Z"), "Morning"); // 11:59 PHT
  assert.equal(manilaDayPeriod("2026-08-11T04:00:00.000Z"), "Afternoon"); // 12:00 PHT
  assert.equal(manilaDayPeriod("2026-08-11T09:59:00.000Z"), "Afternoon"); // 17:59 PHT
  assert.equal(manilaDayPeriod("2026-08-11T10:00:00.000Z"), "Evening"); // 18:00 PHT
  assert.equal(manilaDayPeriod("2026-08-11T20:59:00.000Z"), "Evening"); // 04:59 PHT
});
