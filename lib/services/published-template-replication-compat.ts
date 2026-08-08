import { DocumentType, type Prisma } from "@prisma/client";

export const moveInOutPublishedTemplateReplicationCompatibilityVersion =
  "move-in-out-v1-placeholders-and-margins-v1";
export const certificateOfResidencyPublishedTemplateReplicationCompatibilityVersion =
  "certificate-of-residency-v2-placeholders-and-margins-v1";

// Backward-compatible export retained for existing tests/callers that refer to
// the first replication compatibility profile by its historical generic name.
export const publishedTemplateReplicationCompatibilityVersion =
  moveInOutPublishedTemplateReplicationCompatibilityVersion;

const normalPageMarginsMm = 25.4;

type CompatibilityProfile = {
  compatibilityVersion: string;
  placeholderAliases: Readonly<Record<string, string>>;
};

const moveInOutV1Profile: CompatibilityProfile = {
  compatibilityVersion: moveInOutPublishedTemplateReplicationCompatibilityVersion,
  placeholderAliases: {
    passType: "request.passType",
    partyName: "request.representativeName",
    block: "property.block",
    lot: "property.lot",
    scheduledDate: "request.scheduledDate",
    startTime: "request.startTime",
    endTime: "request.endTime",
    vehicleDetails: "request.vehicleDetails",
    purpose: "request.purpose",
  },
};

const certificateOfResidencyV2Profile: CompatibilityProfile = {
  compatibilityVersion:
    certificateOfResidencyPublishedTemplateReplicationCompatibilityVersion,
  placeholderAliases: {
    homeowner_name: "subject.fullName",
    association_name: "tenant.name",
    issue_day_ordinal: "document.issueDayOrdinal",
    issue_month_year: "document.issueMonthYear",
    office_location: "document.issuePlace",
  },
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

function rewriteTemplateString(
  value: string,
  placeholderAliases: Readonly<Record<string, string>>,
) {
  return value.replace(
    /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g,
    (expression, key: string) => {
      const replacement = placeholderAliases[key];
      return replacement ? `{{${replacement}}}` : expression;
    },
  );
}

function rewriteLegacyPlaceholderReferences(
  value: unknown,
  changes: Set<string>,
  placeholderAliases: Readonly<Record<string, string>>,
  parent: Record<string, unknown> | null = null,
  propertyKey: string | null = null,
): unknown {
  if (typeof value === "string") {
    const shouldTreatAsPlaceholderKey =
      propertyKey === "binding" ||
      propertyKey === "placeholder" ||
      (propertyKey === "key" && parent?.type === "placeholder");

    if (shouldTreatAsPlaceholderKey && placeholderAliases[value]) {
      const replacement = placeholderAliases[value];
      changes.add(`placeholder:${value}->${replacement}`);
      return replacement;
    }

    const rewritten = rewriteTemplateString(value, placeholderAliases);
    if (rewritten !== value) {
      for (const [legacy, replacement] of Object.entries(placeholderAliases)) {
        if (value.match(new RegExp(`\\{\\{\\s*${legacy}\\s*\\}\\}`, "g"))) {
          changes.add(`placeholder:${legacy}->${replacement}`);
        }
      }
    }
    return rewritten;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      rewriteLegacyPlaceholderReferences(
        item,
        changes,
        placeholderAliases,
        null,
        null,
      ),
    );
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        rewriteLegacyPlaceholderReferences(
          child,
          changes,
          placeholderAliases,
          value,
          key,
        ),
      ]),
    );
  }

  return value;
}

function compatibilityProfile(options: {
  type: DocumentType;
  sourceVersion: number;
}) {
  if (
    options.type === DocumentType.MOVE_IN_OUT_PASS &&
    options.sourceVersion === 1
  ) {
    return moveInOutV1Profile;
  }
  if (
    options.type === DocumentType.CERTIFICATE_OF_RESIDENCY &&
    options.sourceVersion === 2
  ) {
    return certificateOfResidencyV2Profile;
  }
  return null;
}

export function normalizePublishedTemplateReplicationSource(options: {
  type: DocumentType;
  sourceVersion: number;
  definitionJson: Prisma.JsonValue;
}): PublishedTemplateReplicationNormalization {
  const profile = compatibilityProfile(options);
  if (!profile) {
    return {
      definitionJson: options.definitionJson,
      compatibilityVersion: null,
      changes: [],
    };
  }

  const changes = new Set<string>();
  const cloned = cloneJson(options.definitionJson);
  const rewritten = rewriteLegacyPlaceholderReferences(
    cloned,
    changes,
    profile.placeholderAliases,
  );

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
    compatibilityVersion: changes.size > 0 ? profile.compatibilityVersion : null,
    changes: [...changes].sort(),
  };
}
