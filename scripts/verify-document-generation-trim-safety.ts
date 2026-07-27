import { DocumentGenerationMode, Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { buildDocumentRenderModel } from "@/lib/services/document-render-model";
import { htmlDocumentRenderer } from "@/lib/services/document-renderers";
import { listDocumentPlaceholders } from "@/lib/services/document-placeholders";
import { defaultTemplateDefinition, validateTemplateDefinition } from "@/lib/services/document-template-builder";

type Check = [name: string, passed: boolean, detail: string];

async function main() {
  const checks: Check[] = [];
  const template = defaultTemplateDefinition("Trim Safety Fixture");
  template.sections.body.push({
    id: "bad-officer-list",
    section: "body",
    type: "officerList",
    order: 90,
    visible: true,
    required: true,
    officerList: {
      source: "TENANT_ORGANIZATION_OFFICERS",
      termMode: "CURRENT",
      roleFilters: [undefined as unknown as string, "President"],
      sortBy: "displayOrder",
      sortDirection: "asc",
      maxOfficers: 5,
      heading: "Officers",
      termLabel: "Term:",
      showHeading: true,
      showTerm: true,
      showSeparators: true,
      headingFontSize: 12,
      termFontSize: 9,
      nameFontSize: 8,
      positionFontSize: 7,
      lineHeight: 1.2,
      officerSpacing: 3,
      nameFontWeight: "bold",
      positionFontWeight: "bold",
      headingColor: "#ffffff",
      termColor: "#0b2a63",
      nameColor: "#111827",
      positionColor: "#0b2a63",
    },
  });
  template.blocks = [...template.sections.header, ...template.sections.body, ...template.sections.footer];

  const validation = capture(() => validateTemplateDefinition(template, { officerPositions: ["President"], activeOfficerCount: 1 }));
  add(checks, "template validation does not throw undefined trim", validation.error == null, validation.error?.message ?? "no throw");
  add(checks, "template validation returns structured role-filter error", validation.value?.errors.some((error) => error.includes("invalid role filters")) === true, validation.value?.errors.join(" | ") ?? "no errors");

  const model = buildDocumentRenderModel({
    templateDefinition: template,
    title: undefined as unknown as string,
    documentNumber: undefined as unknown as string,
    issueDate: "July 27, 2026",
    validUntil: null,
    verificationUrl: null,
    mode: DocumentGenerationMode.PREVIEW,
    placeholderContext: {
      tenantId: "tenant_trim_safety",
      tenant: {},
      subject: {},
      property: {},
      request: {},
      organization: { tenantId: "tenant_trim_safety", officers: [{ id: "officer-1", fullName: "Officer", position: undefined as unknown as string, displayOrder: 1 }] },
      permissions: new Set(["DOCUMENT_PLACEHOLDER:PERSONAL"]),
    },
    placeholderDefinitions: [],
  });
  const rendererValidation = capture(() => htmlDocumentRenderer.validate({ ...model, metadata: { ...model.metadata, title: undefined as unknown as string, documentNumber: undefined as unknown as string } }));
  add(checks, "renderer validation does not throw undefined trim", rendererValidation.error == null, rendererValidation.error?.message ?? "no throw");
  add(checks, "renderer validation returns structured title/body errors", (rendererValidation.value ?? []).some((error) => error.includes("title") || error.includes("body")), (rendererValidation.value ?? []).join(" | "));

  const tenant = await platformPrisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error("A local tenant fixture is required for placeholder trim-safety verification.");
  const placeholders = await captureAsync(() => listDocumentPlaceholders({ authenticatedUserId: "trim-safety", tenantId: tenant.id, role: Role.ADMIN, platform: false }));
  add(checks, "placeholder listing without search does not throw undefined trim", placeholders.error == null, placeholders.error?.message ?? `${placeholders.value?.length ?? 0} placeholders`);

  report(checks);
  await platformPrisma.$disconnect();
}

function capture<T>(fn: () => T) {
  try {
    return { value: fn(), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error : new Error("Unknown error") };
  }
}

async function captureAsync<T>(fn: () => Promise<T>) {
  try {
    return { value: await fn(), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error : new Error("Unknown error") };
  }
}

function add(checks: Check[], name: string, passed: boolean, detail: string) {
  checks.push([name, passed, detail]);
}

function report(checks: Check[]) {
  for (const [name, passed, detail] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name} :: ${detail}`);
  const failed = checks.filter(([, passed]) => !passed);
  if (failed.length) throw new Error(`${failed.length} document generation trim-safety check(s) failed.`);
}

main().catch(async (error) => {
  await platformPrisma.$disconnect().catch(() => undefined);
  throw error;
});
