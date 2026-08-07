import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationPath =
  "prisma/migrations/20260807170000_source_template_compatibility_backfill/migration.sql";

async function migration() {
  return readFile(migrationPath, "utf8");
}

test("source template compatibility backfill is fixed to the approved source tenant and three document types", async () => {
  const sql = await migration();

  assert.match(sql, /tenant_pagsibol4b_default/);
  assert.match(sql, /GATE_PASS/);
  assert.match(sql, /MOVE_IN_OUT_PASS/);
  assert.match(sql, /CERTIFICATE_OF_RESIDENCY/);
  assert.doesNotMatch(sql, /cmrpruwma00063lnps4g7c335/);
});

test("backfill reconstructs legacy compatibility versions without fabricating requested history", async () => {
  const sql = await migration();

  assert.match(sql, /GREATEST\(COALESCE\(tpl\.`version`, 1\), 1\)/);
  assert.match(sql, /legacy-document-template-post-migration-backfill/);
  assert.match(sql, /'schemaVersion', 1/);
  assert.match(sql, /'legacy-body'/);
  assert.match(sql, /tpl\.`body`/);
  assert.doesNotMatch(sql, /WHEN 'CERTIFICATE_OF_RESIDENCY' THEN 2/);
});

test("repair does not activate source definitions or overwrite existing assignments", async () => {
  const sql = await migration();

  assert.match(sql, /'INACTIVE'/);
  assert.match(sql, /false,\s*tpl\.`type`/);
  assert.match(sql, /d\.`assignedTemplateVersionId` IS NULL/);
  assert.match(sql, /COALESCE\(tpl\.`publishedTemplateVersionId`, tv\.`id`\)/);
  assert.match(sql, /NOT EXISTS \([\s\S]*DocumentDefinition[\s\S]*legacyType/);
});
