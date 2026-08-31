import assert from "node:assert/strict";
import test from "node:test";
import { getManilaClock, MANILA_TIME_ZONE } from "../../lib/manila-time";

test("HOAHub business time is explicitly Asia/Manila", () => {
  assert.equal(MANILA_TIME_ZONE, "Asia/Manila");
});

test("UTC August 31 boundary resolves to September 1 in Manila", () => {
  assert.deepEqual(getManilaClock(new Date("2026-08-31T16:30:00.000Z")), {
    year: 2026,
    month: 9,
    day: 1,
  });
});

test("UTC December 31 boundary resolves to January 1 of the next Manila year", () => {
  assert.deepEqual(getManilaClock(new Date("2026-12-31T16:00:00.000Z")), {
    year: 2027,
    month: 1,
    day: 1,
  });
});
