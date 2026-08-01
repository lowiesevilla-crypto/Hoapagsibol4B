import "./register-server-only-shim.cjs";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { allowedDocumentPlaceholders, extractPlaceholders, validateTemplateDefinition } from "@/lib/services/document-template-builder";

export const targetTenantId = "tenant_pagsibol4b_default";
export const expectedDatabaseHost = "127.0.0.1";
export const expectedDatabaseName = "u309242896_hoalive2";

export type ApprovedPassTemplatePackage = {
  packageVersion: 1;
  kind: "HOAHubApprovedPassTemplateDraft";
  layoutId: string;
  displayName: string;
  approvedSource: string;
  contentHash: string;
  definition: unknown;
};

export type TargetPassTemplate = {
  key: "gate-pass" | "move-in-out";
  label: string;
  definitionId: string;
  packageFile: string;
  expectedAssignedVersion: number;
};

export const targetPassTemplates: TargetPassTemplate[] = [
  {
    key: "gate-pass",
    label: "Gate Pass",
    definitionId: "dd_a35620f0864e11f1a28b59f2b5b05598",
    packageFile: "gate-pass-two-copy-a4.json",
    expectedAssignedVersion: 2,
  },
  {
    key: "move-in-out",
    label: "Move-In/Move-Out",
    definitionId: "dd_a35623c7864e11f1a28b59f2b5b05598",
    packageFile: "move-in-out-two-copy-a4.json",
    expectedAssignedVersion: 1,
  },
];

type JsonRecord = Record<string, unknown>;

export function loadOptionalEnvFile(argv = process.argv.slice(2)) {
  const envFileArgument = argv.find((argument) => argument.startsWith("--env-file="));
  if (!envFileArgument) return;
  const envFile = envFileArgument.slice("--env-file=".length).trim();
  if (!path.isAbsolute(envFile)) throw new Error("--env-file must be an absolute private path.");
  if (!fs.existsSync(envFile)) throw new Error("--env-file does not exist.");
  const contents = fs.readFileSync(envFile, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const value = match[2].replace(/^"|"$/g, "");
    if (process.env[match[1]] == null) process.env[match[1]] = value;
  }
}

export function assertProductionGuards() {
  if (process.platform === "win32") {
    throw new Error("Refusing to run production pass-template scripts from the local Windows development environment.");
  }
  if (process.env.CONFIRM_HOSTINGER_TEMPLATE_INSTALL !== "YES") {
    throw new Error("CONFIRM_HOSTINGER_TEMPLATE_INSTALL=YES is required.");
  }
  if (process.env.CONFIRM_TENANT_ID !== targetTenantId) {
    throw new Error(`CONFIRM_TENANT_ID=${targetTenantId} is required.`);
  }
  if (process.env.EXPECTED_DATABASE_HOST !== expectedDatabaseHost) {
    throw new Error(`EXPECTED_DATABASE_HOST=${expectedDatabaseHost} is required.`);
  }
  if (process.env.EXPECTED_DATABASE_NAME !== expectedDatabaseName) {
    throw new Error(`EXPECTED_DATABASE_NAME=${expectedDatabaseName} is required.`);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Production DATABASE_URL is unavailable.");
  const parsed = parseDatabaseUrl(databaseUrl);
  if (parsed.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql://.");
  if (parsed.host === "localhost" || parsed.host === "::1") throw new Error("DATABASE_URL host must not be localhost or ::1.");
  if (parsed.host !== expectedDatabaseHost) throw new Error("DATABASE_URL host does not match EXPECTED_DATABASE_HOST.");
  if (parsed.database === "hoahub_prodclone_local" || parsed.database === "hoa_portal") {
    throw new Error("Refusing to run against a non-production database.");
  }
  if (parsed.database !== expectedDatabaseName) throw new Error("DATABASE_URL database does not match EXPECTED_DATABASE_NAME.");
}

export function parseDatabaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  return {
    protocol: url.protocol,
    host: url.hostname,
    database: url.pathname.replace(/^\//, ""),
  };
}

export function templatesDirectory() {
  return path.join(process.cwd(), "templates", "pass-templates");
}

export function loadApprovedPackage(target: TargetPassTemplate) {
  const fullPath = path.join(templatesDirectory(), target.packageFile);
  const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8")) as ApprovedPassTemplatePackage;
  validateApprovedPackage(parsed, target);
  return parsed;
}

export function loadApprovedPackages() {
  return targetPassTemplates.map((target) => ({ target, pkg: loadApprovedPackage(target) }));
}

export function validateApprovedPackage(pkg: ApprovedPassTemplatePackage, target: TargetPassTemplate) {
  if (pkg.packageVersion !== 1) throw new Error(`${target.label} package has an unsupported packageVersion.`);
  if (pkg.kind !== "HOAHubApprovedPassTemplateDraft") throw new Error(`${target.label} package kind is invalid.`);
  const contentHash = hashTemplateDefinition(pkg.definition);
  if (pkg.contentHash !== contentHash) throw new Error(`${target.label} package contentHash does not match its definition.`);
  const validation = validateTemplateDefinition(pkg.definition, { allowedPlaceholders: new Set(allowedDocumentPlaceholders) });
  if (!validation.valid) throw new Error(`${target.label} package template is invalid: ${validation.errors.join("; ")}`);
  const placeholders = new Set(flattenStrings(pkg.definition).flatMap((value) => extractPlaceholders(value)));
  const unsupported = [...placeholders].filter((placeholder) => !allowedDocumentPlaceholders.includes(placeholder as never));
  if (unsupported.length) throw new Error(`${target.label} package contains unsupported placeholders: ${unsupported.join(", ")}`);
  assertNoSensitiveContent(pkg, target);
  assertRequiredLayout(pkg, target);
}

export function hashTemplateDefinition(definition: unknown) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonicalize(definition))).digest("hex")}`;
}

export function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => flattenStrings(item));
  if (value && typeof value === "object") return Object.values(value).flatMap((item) => flattenStrings(item));
  return [];
}

export function assertRequiredLayout(pkg: ApprovedPassTemplatePackage, target: TargetPassTemplate) {
  const definition = asRecord(pkg.definition);
  const page = asRecord(definition.page);
  if (page.format !== "A4" || page.orientation !== "portrait") throw new Error(`${target.label} package must be A4 portrait.`);
  const allText = flattenStrings(pkg.definition).join("\n");
  assertCount(allText, "MARSHAL'S COPY", 1, `${target.label} must contain Marshal's Copy.`);
  assertCount(allText, "HOMEOWNER'S COPY", 1, `${target.label} must contain Homeowner's Copy.`);
  assertCount(allText, "{{tenant.name}}", 2, `${target.label} must include a dynamic tenant header on both copies.`);
  assertCount(allText, "{{document.number}}", 2, `${target.label} must include document-control rows on both copies.`);
  assertCount(allText, "SCAN TO VERIFY", 2, `${target.label} must include QR labels on both copies.`);
  if (!allText.includes("CUT HERE")) throw new Error(`${target.label} must include a cut-line label.`);
  if (!allText.includes("#071f4f") || !allText.includes("#c79318")) throw new Error(`${target.label} must use the navy-and-gold layout.`);
  const blocks = flattenBlocks(definition);
  const qrBlocks = blocks.filter((block) => block.type === "qrVerification");
  if (qrBlocks.length !== 2) throw new Error(`${target.label} must contain exactly two QR blocks.`);
  const dashedLines = blocks.filter((block) => block.type === "horizontalLine" && asRecord(block.style).lineStyle === "dashed");
  if (!dashedLines.length) throw new Error(`${target.label} must include a dashed cut line.`);
}

export function approvedInstallMetadata(pkg: ApprovedPassTemplatePackage): JsonRecord {
  return {
    approvedPassTemplateInstall: {
      layoutId: pkg.layoutId,
      contentHash: pkg.contentHash,
      installedBy: "scripts/install-approved-pass-template-drafts.ts",
    },
  };
}

function assertNoSensitiveContent(pkg: ApprovedPassTemplatePackage, target: TargetPassTemplate) {
  const allText = flattenStrings(pkg).join("\n");
  const forbiddenPatterns = [
    /mysql:\/\//i,
    /DATABASE_URL/i,
    /u309242896/i,
    /hoahub_prodclone_local/i,
    /Pagsibol Village East 4B/i,
    /Sabang,\s*Naic/i,
    /office@example/i,
    /0917\s*\d{3}\s*\d{4}/i,
    /Juan\s+Miguel/i,
    /Maria\s+Santos/i,
    /Pedro\s+Santos/i,
    /DOC-UAT/i,
    /uat-token/i,
    /Certificate of Residency/i,
    /HOA Office Copy/i,
  ];
  const match = forbiddenPatterns.find((pattern) => pattern.test(allText));
  if (match) throw new Error(`${target.label} package contains forbidden sensitive or hardcoded content: ${match}`);
}

function assertCount(text: string, needle: string, expectedMinimum: number, message: string) {
  const count = text.split(needle).length - 1;
  if (count < expectedMinimum) throw new Error(message);
}

function flattenBlocks(definition: JsonRecord): JsonRecord[] {
  const sections = asRecord(definition.sections);
  return ["header", "body", "footer"].flatMap((section) => {
    const blocks = sections[section];
    return Array.isArray(blocks) ? blocks.filter(isRecord) : [];
  });
}

function asRecord(value: unknown): JsonRecord {
  if (!isRecord(value)) throw new Error("Expected a JSON object.");
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
