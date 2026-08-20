import assert from "node:assert/strict";
import test from "node:test";
import { homeownerSearchWhere, parseHomeownerSearch } from "@/lib/homeowner-admin-search";

test("homeowner search parses combined block and lot phrases", () => {
  assert.deepEqual(parseHomeownerSearch("block 1 lot 2"), { block: "1", lot: "2", terms: [] });
  assert.deepEqual(parseHomeownerSearch("BLK:7 LOT-12A"), { block: "7", lot: "12a", terms: [] });
});

test("homeowner search keeps residual name or account terms with property filters", () => {
  assert.deepEqual(parseHomeownerSearch("block 3 lot 9 dela cruz"), { block: "3", lot: "9", terms: ["dela", "cruz"] });
  assert.deepEqual(parseHomeownerSearch("HOA-000123"), { terms: ["hoa-000123"] });
});

test("homeowner search builds ANDed property constraints instead of generic block tokens", () => {
  const where = homeownerSearchWhere("block 1 lot 2");
  assert.deepEqual(where, {
    AND: [
      { block: { contains: "1" } },
      { lot: { contains: "2" } },
    ],
  });
});

test("empty homeowner search does not add a filter", () => {
  assert.deepEqual(homeownerSearchWhere("   "), {});
});
