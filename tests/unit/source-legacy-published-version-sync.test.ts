import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationPath =
  "prisma/migrations/20260807201500_source_legacy_published_version_sync/migration.sql";

async function migration() {
  return readFile(migrationPath, "utf8");
}

test("legacy source sync is fixed to the approved source tenant and exact current versions", async () => {
  const sql = await migration();

  assert.match(sql, /tenant_pagsibol4b_default/);
  assert.match(sql, /tpl\.`type` = 'GATE_PASS' AND tpl\.`version` = 2/);
  assert.match(sql, /tpl\.`type` = 'MOVE_IN_OUT_PASS' AND tpl\.`version` = 1/);
  assert.match(sql, /tpl\.`type` = 'CERTIFICATE_OF_RESIDENCY' AND tpl\.`version` = 2/);
  assert.match(sql, /tpl\.`active` = true/);
  assert.doesNotMatch(sql, /cmrpruwma00063lnps4g7c335/);
});

test("legacy source sync materializes existing body as published compatibility content without assigning it", async () => {
  const sql = await migration();

  assert.match(sql, /INSERT INTO `DocumentTemplateSet`/);
  assert.match(sql, /INSERT INTO `DocumentTemplateVersion`/);
  assert.match(sql, /'PUBLISHED'/);
  assert.match(sql, /'active-legacy-document-template-published-sync'/);
  assert.match(sql, /'text', tpl\.`body`/);
  assert.match(sql, /'legacyVersion', tpl\.`version`/);
  assert.match(sql, /Deliberately no UPDATE of DocumentDefinition\.assignedTemplateVersionId/);
  assert.doesNotMatch(sql, /UPDATE\s+`DocumentDefinition`/i);
});

test("legacy source sync only fills a missing exact published version and never overwrites history", async () => {
  const sql = await migration();

  assert.match(sql, /existing_version\.`status` = 'PUBLISHED'/);
  assert.match(sql, /existing_version\.`version` = tpl\.`version`/);
  assert.match(sql, /NOT EXISTS/);
  assert.doesNotMatch(sql, /DELETE FROM `DocumentTemplateVersion`/i);
  assert.doesNotMatch(sql, /UPDATE\s+`DocumentTemplateVersion`/i);
});
