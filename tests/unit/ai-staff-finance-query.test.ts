import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyStaffFinanceQuery, parseStaffFinanceDateRange } from "@/lib/ai-assistance/staff-finance-query";

test("monthly dues collection questions route to live tenant finance", () => {
  assert.equal(classifyStaffFinanceQuery("How much is the Monthly Dues collection for August 2026"), "MONTHLY_DUES_COLLECTION");
  assert.equal(classifyStaffFinanceQuery("How much monthly dues did we collect in Aug 2026?"), "MONTHLY_DUES_COLLECTION");
  assert.equal(classifyStaffFinanceQuery("Total collection for June 2026"), "TOTAL_COLLECTION");
  assert.equal(classifyStaffFinanceQuery("How much is total collection from January until now?"), "TOTAL_COLLECTION");
});

test("collection policy questions remain on approved knowledge retrieval", () => {
  assert.equal(classifyStaffFinanceQuery("What does the approved collection policy say?"), null);
  assert.equal(classifyStaffFinanceQuery("Summarize the monthly dues collection procedure"), null);
});

test("explicit month and relative ranges are parsed using tenant business dates", () => {
  const now = new Date("2026-09-15T05:00:00.000Z");
  const august = parseStaffFinanceDateRange("Monthly Dues collection for August 2026", now);
  assert.ok(august);
  assert.equal(august.label, "August 2026");
  assert.equal(august.start.toISOString(), "2026-07-31T16:00:00.000Z");
  assert.equal(august.end.toISOString(), "2026-08-31T16:00:00.000Z");

  const ytd = parseStaffFinanceDateRange("total collection from January until now", now);
  assert.ok(ytd);
  assert.equal(ytd.start.toISOString(), "2025-12-31T16:00:00.000Z");
  assert.equal(ytd.end.toISOString(), "2026-09-15T16:00:00.000Z");

  const lastMonth = parseStaffFinanceDateRange("total collection last month", now);
  assert.ok(lastMonth);
  assert.equal(lastMonth.label, "August 2026");
});

test("staff ask route resolves deterministic finance before business services and document RAG", async () => {
  const route = await readFile("app/api/admin/ai/ask/route.ts", "utf8");
  assert.match(route, /tryAnswerStaffFinanceQuestion/);
  assert.match(route, /financeAnswer \?\? await tryAnswerAiBusinessQuestion/);
  assert.match(route, /businessAnswer \?\? await answerTenantKnowledgeQuestionWithReasoning/);
});
