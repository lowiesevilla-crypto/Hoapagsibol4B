import { DocumentType, type Prisma } from "@prisma/client";

export const publishedTemplateReplicationCompatibilityVersion =
  "move-in-out-v1-placeholders-and-margins-v1";

const normalPageMarginsMm = 25.4;

const moveInOutV1PlaceholderAliases: Readonly<Record<string, string>> = {
  passType: "request.passType",
  partyName: "request.representativeName",
  block: "property.block",
  lot: "property.lot",
  scheduledDate: "request.scheduledDate",
  startTime: "request.startTime",
  endTime: "request.endTime",
  vehicleDetails: "request.vehicleDetails",
  purpose: "request.purpose",
};

export type PublishedTemplateReplicationNormalization = {
  definitionJson: Prisma.JsonValue;
  compatibilityVersion: string | null;
  changes: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value: Prisma.JsonValue): Prisma.JsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;
}

function rewriteTemplateString(value: string) {
  return value.replace(
    /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g,
    (expression, key: string) => {
      const replacement = moveInOutV1PlaceholderAliases[key];
      return replacement ? `{{${replacement}}}` : expression;
    },
  );
}

function rewriteLegacyPlaceholderReferences(
  value: unknown,
  changes: Set<string>,
  parent: Record<string, unknown> | null = null,
  propertyKey: string | null = null,
): unknown {
  if (typeof value === "string") {
    const shouldTreatAsPlaceholderKey =
      propertyKey === "binding" ||
      propertyKey === "placeholder" ||
      (propertyKey === "key" && parent?.type === "placeholder");

    if (shouldTreatAsPlaceholderKey && moveInOutV1PlaceholderAliases[value]) {
      const replacement = moveInOutV1PlaceholderAliases[value];
      changes.add(`placeholder:${value}->${replacement}`);
      return replacement;
    }

    const rewritten = rewriteTemplateString(value);
    if (rewritten !== value) {
      for (const [legacy, replacement] of Object.entries(moveInOutV1PlaceholderAliases)) {
        if (value.match(new RegExp(`\\{\\{\\s*${legacy}\\s*\\}\\}`, "g"))) {
          changes.add(`placeholder:${legacy}->${replacement}`);
        }
      }
    }
    return rewritten;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      rewriteLegacyPlaceholderReferences(item, changes, null, null),
    );
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        rewriteLegacyPlaceholderReferences(child, changes, value, key),
      ]),
    );
  }

  return value;
}

export function normalizePublishedTemplateReplicationSource(options: {
  type: DocumentType;
  sourceVersion: number;
  definitionJson: Prisma.JsonValue;
}): PublishedTemplateReplicationNormalization {
  if (
    options.type !== DocumentType.MOVE_IN_OUT_PASS ||
    options.sourceVersion !== 1
  ) {
    return {
      definitionJson: options.definitionJson,
      compatibilityVersion: null,
      changes: [],
    };
  }

  const changes = new Set<string>();
  const cloned = cloneJson(options.definitionJson);
  const rewritten = rewriteLegacyPlaceholderReferences(cloned, changes);

  if (isRecord(rewritten)) {
    const page = isRecord(rewritten.page) ? rewritten.page : null;
    if (page && !isRecord(page.margins)) {
      page.margins = {
        top: normalPageMarginsMm,
        right: normalPageMarginsMm,
        bottom: normalPageMarginsMm,
        left: normalPageMarginsMm,
      };
      changes.add("page.margins:normal-25.4mm");
    }
  }

  return {
    definitionJson: rewritten as Prisma.JsonValue,
    compatibilityVersion:
      changes.size > 0 ? publishedTemplateReplicationCompatibilityVersion : null,
    changes: [...changes].sort(),
  };
}
