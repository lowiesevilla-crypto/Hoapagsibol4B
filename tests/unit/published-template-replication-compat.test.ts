import assert from "node:assert/strict";
import { test } from "node:test";
import { DocumentType, type Prisma } from "@prisma/client";

import {
  allowedDocumentPlaceholders,
  validateTemplateDefinition,
} from "@/lib/services/document-template-builder";
import {
  normalizePublishedTemplateReplicationSource,
  publishedTemplateReplicationCompatibilityVersion,
} from "@/lib/services/published-template-replication-compat";

function legacyMovePassDefinition(binding = "passType"): Prisma.JsonValue {
  return {
    schemaVersion: 1,
    page: {
      format: "A4",
      orientation: "portrait",
      widthMm: 210,
      heightMm: 297,
    },
    blocks: [
      {
        id: "legacy-pass-fields",
        type: "text",
        section: "body",
        binding,
        order: 1,
        visible: true,
        content:
          "{{partyName}} {{block}} {{lot}} {{scheduledDate}} {{startTime}} {{endTime}} {{vehicleDetails}} {{purpose}}",
      },
    ],
    meta: { editor: "professional-document-editor" },
  } as Prisma.JsonValue;
}

test("normalizes only the approved Move-In/Out v1 legacy aliases and adds normal margins", () => {
  const result = normalizePublishedTemplateReplicationSource({
    type: DocumentType.MOVE_IN_OUT_PASS,
    sourceVersion: 1,
    definitionJson: legacyMovePassDefinition(),
  });

  assert.equal(
    result.compatibilityVersion,
    publishedTemplateReplicationCompatibilityVersion,
  );
  assert.deepEqual(
    (result.definitionJson as Record<string, any>).page.margins,
    { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  );

  const block = (result.definitionJson as Record<string, any>).blocks[0];
  assert.equal(block.binding, "request.passType");
  assert.equal(
    block.content,
    "{{request.representativeName}} {{property.block}} {{property.lot}} {{request.scheduledDate}} {{request.startTime}} {{request.endTime}} {{request.vehicleDetails}} {{request.purpose}}",
  );
  assert.ok(result.changes.includes("placeholder:partyName->request.representativeName"));
  assert.ok(result.changes.includes("page.margins:normal-25.4mm"));

  const validation = validateTemplateDefinition(result.definitionJson, {
    allowedPlaceholders: new Set(allowedDocumentPlaceholders),
  });
  assert.equal(validation.valid, true, validation.errors.join("; "));
});

test("leaves unknown legacy placeholders invalid instead of silently accepting them", () => {
  const result = normalizePublishedTemplateReplicationSource({
    type: DocumentType.MOVE_IN_OUT_PASS,
    sourceVersion: 1,
    definitionJson: legacyMovePassDefinition("legacyMystery"),
  });
  const validation = validateTemplateDefinition(result.definitionJson, {
    allowedPlaceholders: new Set(allowedDocumentPlaceholders),
  });

  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.includes("Unsupported placeholder: legacyMystery"),
    validation.errors.join("; "),
  );
});

test("does not normalize other document types or Move-In/Out source versions", () => {
  const definition = legacyMovePassDefinition();
  const otherType = normalizePublishedTemplateReplicationSource({
    type: DocumentType.GATE_PASS,
    sourceVersion: 8,
    definitionJson: definition,
  });
  const otherVersion = normalizePublishedTemplateReplicationSource({
    type: DocumentType.MOVE_IN_OUT_PASS,
    sourceVersion: 2,
    definitionJson: definition,
  });

  assert.equal(otherType.compatibilityVersion, null);
  assert.equal(otherVersion.compatibilityVersion, null);
  assert.deepEqual(otherType.changes, []);
  assert.deepEqual(otherVersion.changes, []);
  assert.equal(otherType.definitionJson, definition);
  assert.equal(otherVersion.definitionJson, definition);
});
