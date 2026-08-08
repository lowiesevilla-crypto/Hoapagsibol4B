import assert from "node:assert/strict";
import { test } from "node:test";
import { DocumentType, type Prisma } from "@prisma/client";

import {
  allowedDocumentPlaceholders,
  validateTemplateDefinition,
} from "@/lib/services/document-template-builder";
import {
  certificateOfResidencyPublishedTemplateReplicationCompatibilityVersion,
  moveInOutPublishedTemplateReplicationCompatibilityVersion,
  normalizePublishedTemplateReplicationSource,
} from "@/lib/services/published-template-replication-compat";

function legacyDefinition(options: {
  binding: string;
  content: string;
}): Prisma.JsonValue {
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
        id: "legacy-fields",
        type: "text",
        section: "body",
        binding: options.binding,
        order: 1,
        visible: true,
        content: options.content,
      },
    ],
    meta: { editor: "professional-document-editor" },
  } as Prisma.JsonValue;
}

function legacyMovePassDefinition(binding = "passType") {
  return legacyDefinition({
    binding,
    content:
      "{{partyName}} {{block}} {{lot}} {{scheduledDate}} {{startTime}} {{endTime}} {{vehicleDetails}} {{purpose}}",
  });
}

function legacyResidencyDefinition(binding = "homeowner_name") {
  return legacyDefinition({
    binding,
    content:
      "This certifies {{homeowner_name}} of {{association_name}}. Issued this {{issue_day_ordinal}} day of {{issue_month_year}} at {{office_location}}.",
  });
}

function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function assertNormalMargins(definitionJson: Prisma.JsonValue) {
  const definition = record(definitionJson);
  const page = record(definition.page);
  assert.deepEqual(page.margins, {
    top: 25.4,
    right: 25.4,
    bottom: 25.4,
    left: 25.4,
  });
  assert.ok(Array.isArray(definition.blocks));
  return record(definition.blocks[0]);
}

function assertCurrentValidationPasses(definitionJson: Prisma.JsonValue) {
  const validation = validateTemplateDefinition(definitionJson, {
    allowedPlaceholders: new Set(allowedDocumentPlaceholders),
  });
  assert.equal(validation.valid, true, validation.errors.join("; "));
}

test("normalizes only the approved Move-In/Out v1 legacy aliases and adds normal margins", () => {
  const result = normalizePublishedTemplateReplicationSource({
    type: DocumentType.MOVE_IN_OUT_PASS,
    sourceVersion: 1,
    definitionJson: legacyMovePassDefinition(),
  });

  assert.equal(
    result.compatibilityVersion,
    moveInOutPublishedTemplateReplicationCompatibilityVersion,
  );
  const block = assertNormalMargins(result.definitionJson);
  assert.equal(block.binding, "request.passType");
  assert.equal(
    block.content,
    "{{request.representativeName}} {{property.block}} {{property.lot}} {{request.scheduledDate}} {{request.startTime}} {{request.endTime}} {{request.vehicleDetails}} {{request.purpose}}",
  );
  assert.ok(result.changes.includes("placeholder:partyName->request.representativeName"));
  assert.ok(result.changes.includes("page.margins:normal-25.4mm"));
  assertCurrentValidationPasses(result.definitionJson);
});

test("normalizes the approved Certificate of Residency v2 aliases without collapsing date fragments", () => {
  const result = normalizePublishedTemplateReplicationSource({
    type: DocumentType.CERTIFICATE_OF_RESIDENCY,
    sourceVersion: 2,
    definitionJson: legacyResidencyDefinition(),
  });

  assert.equal(
    result.compatibilityVersion,
    certificateOfResidencyPublishedTemplateReplicationCompatibilityVersion,
  );
  const block = assertNormalMargins(result.definitionJson);
  assert.equal(block.binding, "subject.fullName");
  assert.equal(
    block.content,
    "This certifies {{subject.fullName}} of {{tenant.name}}. Issued this {{document.issueDayOrdinal}} day of {{document.issueMonthYear}} at {{document.issuePlace}}.",
  );
  assert.ok(result.changes.includes("placeholder:homeowner_name->subject.fullName"));
  assert.ok(result.changes.includes("placeholder:association_name->tenant.name"));
  assert.ok(result.changes.includes("placeholder:issue_day_ordinal->document.issueDayOrdinal"));
  assert.ok(result.changes.includes("placeholder:issue_month_year->document.issueMonthYear"));
  assert.ok(result.changes.includes("placeholder:office_location->document.issuePlace"));
  assertCurrentValidationPasses(result.definitionJson);
});

test("leaves unknown legacy placeholders invalid instead of silently accepting them", () => {
  const moveResult = normalizePublishedTemplateReplicationSource({
    type: DocumentType.MOVE_IN_OUT_PASS,
    sourceVersion: 1,
    definitionJson: legacyMovePassDefinition("legacyMystery"),
  });
  const residencyResult = normalizePublishedTemplateReplicationSource({
    type: DocumentType.CERTIFICATE_OF_RESIDENCY,
    sourceVersion: 2,
    definitionJson: legacyResidencyDefinition("legacyResidencyMystery"),
  });

  for (const [result, expected] of [
    [moveResult, "Unsupported placeholder: legacyMystery"],
    [residencyResult, "Unsupported placeholder: legacyResidencyMystery"],
  ] as const) {
    const validation = validateTemplateDefinition(result.definitionJson, {
      allowedPlaceholders: new Set(allowedDocumentPlaceholders),
    });
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes(expected), validation.errors.join("; "));
  }
});

test("does not normalize unapproved document types or source versions", () => {
  const moveDefinition = legacyMovePassDefinition();
  const residencyDefinition = legacyResidencyDefinition();
  const cases = [
    normalizePublishedTemplateReplicationSource({
      type: DocumentType.GATE_PASS,
      sourceVersion: 8,
      definitionJson: moveDefinition,
    }),
    normalizePublishedTemplateReplicationSource({
      type: DocumentType.MOVE_IN_OUT_PASS,
      sourceVersion: 2,
      definitionJson: moveDefinition,
    }),
    normalizePublishedTemplateReplicationSource({
      type: DocumentType.CERTIFICATE_OF_RESIDENCY,
      sourceVersion: 1,
      definitionJson: residencyDefinition,
    }),
  ];

  for (const result of cases) {
    assert.equal(result.compatibilityVersion, null);
    assert.deepEqual(result.changes, []);
  }
  assert.equal(cases[0].definitionJson, moveDefinition);
  assert.equal(cases[1].definitionJson, moveDefinition);
  assert.equal(cases[2].definitionJson, residencyDefinition);
});
