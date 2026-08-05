export type DocumentReadinessSeverity = "ready" | "warning" | "blocking";

export type DocumentReadinessCheck = {
  key: string;
  label: string;
  severity: DocumentReadinessSeverity;
  detail: string;
  href?: string;
};

export type DocumentReadinessDefinition = {
  id: string;
  code: string;
  displayName: string;
  status: string;
  active: boolean;
  archivedAt?: Date | null;
  approvalRequired: boolean;
  paymentRequired: boolean;
  feeAmount: number | string | { toString(): string };
  receiptRequired: boolean;
  releaseRequired: boolean;
  homeownerDownloadEnabled: boolean;
  numberingFormat: string;
  assignedTemplateVersionId?: string | null;
  workflowDefinitionId?: string | null;
  signatoryOfficerId?: string | null;
  fields?: readonly { active: boolean }[];
  assignedTemplateVersion?: { status: string } | null;
  workflowDefinition?: {
    steps: readonly {
      required: boolean;
      stepType: string;
      approverRole?: string | null;
      approverUserId?: string | null;
    }[];
  } | null;
  signatoryOfficer?: { active: boolean; archivedAt?: Date | null } | null;
};

export type DocumentPaymentReadiness = {
  gcashAccountName?: string | null;
  gcashMobileNumber?: string | null;
  gcashQrImageUrl?: string | null;
  paymentInstructions?: string | null;
};

export type DocumentationReadiness = {
  checks: DocumentReadinessCheck[];
  definitions: {
    id: string;
    code: string;
    displayName: string;
    severity: DocumentReadinessSeverity;
    checks: DocumentReadinessCheck[];
  }[];
  blockingCount: number;
  warningCount: number;
  readyCount: number;
  productionReady: boolean;
};

const activeGenerationStates = new Set(["VALIDATING", "READY", "RENDERING", "GENERATED"]);
const terminalRequestStatuses = new Set([
  "ISSUED",
  "READY_FOR_DOWNLOAD",
  "GENERATED",
  "DOWNLOADED",
  "REJECTED",
  "CANCELLED",
  "REVOKED",
]);

function amount(value: DocumentReadinessDefinition["feeAmount"]) {
  return Number(typeof value === "object" ? value.toString() : value) || 0;
}

function check(
  key: string,
  label: string,
  severity: DocumentReadinessSeverity,
  detail: string,
  href?: string,
): DocumentReadinessCheck {
  return { key, label, severity, detail, href };
}

function worstSeverity(checks: readonly DocumentReadinessCheck[]): DocumentReadinessSeverity {
  if (checks.some((item) => item.severity === "blocking")) return "blocking";
  if (checks.some((item) => item.severity === "warning")) return "warning";
  return "ready";
}

export function evaluateDocumentDefinitionReadiness(
  definition: DocumentReadinessDefinition,
  payment: DocumentPaymentReadiness,
) {
  const configureHref = `/admin/settings/document-definitions?edit=${definition.id}`;
  const templateHref = `/admin/settings/document-definitions/${definition.id}/templates`;
  const checks: DocumentReadinessCheck[] = [];

  const active = definition.active && definition.status === "ACTIVE" && !definition.archivedAt;
  checks.push(check(
    `${definition.id}:active`,
    "Active definition",
    active ? "ready" : "blocking",
    active ? "The definition is active and available for operations." : "Activate the definition after completing all blocking configuration.",
    configureHref,
  ));

  const publishedTemplate = Boolean(
    definition.assignedTemplateVersionId
      && definition.assignedTemplateVersion?.status === "PUBLISHED",
  );
  checks.push(check(
    `${definition.id}:template`,
    "Published template",
    publishedTemplate ? "ready" : "blocking",
    publishedTemplate ? "A published template version is assigned." : "Publish and assign a template version before accepting production requests.",
    templateHref,
  ));

  const numberingReady = /\{SEQUENCE(?::\d+)?\}/.test(definition.numberingFormat || "");
  checks.push(check(
    `${definition.id}:numbering`,
    "Document numbering",
    numberingReady ? "ready" : "blocking",
    numberingReady ? `Numbering format: ${definition.numberingFormat}` : "The numbering format must contain a sequence token such as {SEQUENCE:6}.",
    configureHref,
  ));

  if (definition.approvalRequired) {
    const approvalSteps = definition.workflowDefinition?.steps.filter(
      (step) => step.required && (step.stepType === "APPROVAL" || step.stepType === "REVIEW"),
    ) ?? [];
    const assignedApprover = approvalSteps.some((step) => step.approverRole || step.approverUserId);
    checks.push(check(
      `${definition.id}:workflow`,
      "Approval workflow",
      definition.workflowDefinitionId && approvalSteps.length > 0
        ? assignedApprover ? "ready" : "warning"
        : "warning",
      definition.workflowDefinitionId && approvalSteps.length > 0
        ? assignedApprover
          ? "A required review or approval step has an assigned role or user."
          : "The workflow has a required step but no explicit approver; tenant administrators may approve under the default policy."
        : "Approval uses the definition's default tenant-admin workflow. Configure explicit steps for stronger segregation of duties.",
      configureHref,
    ));
  } else {
    checks.push(check(
      `${definition.id}:workflow`,
      "Approval workflow",
      "ready",
      "This definition does not require approval.",
      configureHref,
    ));
  }

  const requiresSignatory = definition.releaseRequired || /CERTIFICATE|CERTIFICATION|CLEARANCE/.test(definition.code);
  const signatoryReady = Boolean(
    definition.signatoryOfficerId
      && definition.signatoryOfficer?.active
      && !definition.signatoryOfficer.archivedAt,
  );
  checks.push(check(
    `${definition.id}:signatory`,
    "Authorized signatory",
    requiresSignatory ? signatoryReady ? "ready" : "blocking" : signatoryReady ? "ready" : "warning",
    signatoryReady
      ? "An active organization officer is assigned as signatory."
      : requiresSignatory
        ? "Assign an active organization officer before issuing this official document."
        : "No signatory is assigned. Confirm that this pass or request-only document does not require one.",
    configureHref,
  ));

  if (definition.paymentRequired) {
    const feeReady = amount(definition.feeAmount) > 0;
    checks.push(check(
      `${definition.id}:fee`,
      "Document fee",
      feeReady ? "ready" : "blocking",
      feeReady ? `Configured fee: PHP ${amount(definition.feeAmount).toFixed(2)}` : "Payment is required but the fee is zero or invalid.",
      configureHref,
    ));
    const paymentReady = Boolean(
      payment.gcashAccountName
        && payment.gcashMobileNumber
        && payment.gcashQrImageUrl
        && payment.paymentInstructions,
    );
    checks.push(check(
      `${definition.id}:payment-settings`,
      "Payment instructions",
      paymentReady ? "ready" : "blocking",
      paymentReady ? "GCash account, number, QR image, and instructions are configured." : "Complete the tenant's GCash account, mobile number, QR image, and payment instructions.",
      "/admin/settings?section=PAYMENT",
    ));
  } else {
    checks.push(check(
      `${definition.id}:fee`,
      "Document fee",
      definition.receiptRequired ? "blocking" : "ready",
      definition.receiptRequired
        ? "Receipt is required while payment is disabled. Enable payment or disable the receipt requirement."
        : "No document fee is required.",
      configureHref,
    ));
  }

  const activeFields = definition.fields?.filter((field) => field.active).length ?? 0;
  checks.push(check(
    `${definition.id}:fields`,
    "Request fields",
    activeFields > 0 ? "ready" : "warning",
    activeFields > 0 ? `${activeFields} active request field${activeFields === 1 ? "" : "s"} configured.` : "No custom request fields are configured. Confirm that purpose and built-in subject fields are sufficient.",
    configureHref,
  ));

  checks.push(check(
    `${definition.id}:homeowner-visibility`,
    "Homeowner delivery",
    definition.homeownerDownloadEnabled && !publishedTemplate ? "blocking" : "ready",
    definition.homeownerDownloadEnabled
      ? publishedTemplate ? "Homeowner view/download is enabled with a published template." : "Homeowner download is enabled but no published template is assigned."
      : "Homeowner download is disabled; staff must manage delivery outside the portal.",
    configureHref,
  ));

  return { checks, severity: worstSeverity(checks) };
}

export function evaluateDocumentationReadiness(
  definitions: readonly DocumentReadinessDefinition[],
  payment: DocumentPaymentReadiness,
): DocumentationReadiness {
  const activeDefinitions = definitions.filter((definition) => !definition.archivedAt);
  const checks: DocumentReadinessCheck[] = [];
  checks.push(check(
    "catalog:definitions",
    "Document catalog",
    activeDefinitions.length > 0 ? "ready" : "blocking",
    activeDefinitions.length > 0 ? `${activeDefinitions.length} non-archived document definition${activeDefinitions.length === 1 ? "" : "s"} found.` : "Create at least one document definition.",
    "/admin/settings/document-definitions",
  ));

  const evaluated = activeDefinitions.map((definition) => {
    const result = evaluateDocumentDefinitionReadiness(definition, payment);
    return {
      id: definition.id,
      code: definition.code,
      displayName: definition.displayName,
      severity: result.severity,
      checks: result.checks,
    };
  });
  const definitionChecks = evaluated.flatMap((definition) => definition.checks);
  const allChecks = [...checks, ...definitionChecks];
  const blockingCount = allChecks.filter((item) => item.severity === "blocking").length;
  const warningCount = allChecks.filter((item) => item.severity === "warning").length;
  const readyCount = allChecks.filter((item) => item.severity === "ready").length;
  return {
    checks,
    definitions: evaluated,
    blockingCount,
    warningCount,
    readyCount,
    productionReady: activeDefinitions.some((definition) => definition.active)
      && blockingCount === 0,
  };
}

export function documentRequestAgeDays(requestedAt: Date, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - requestedAt.getTime()) / 86_400_000));
}

export function documentRequestAgeBand(requestedAt: Date, now = new Date()) {
  const days = documentRequestAgeDays(requestedAt, now);
  if (days >= 8) return { key: "critical", label: "8+ days", days } as const;
  if (days >= 4) return { key: "attention", label: "4–7 days", days } as const;
  if (days >= 2) return { key: "watch", label: "2–3 days", days } as const;
  return { key: "fresh", label: "0–1 day", days } as const;
}

export function isStaleDocumentGenerationAttempt(
  state: string,
  updatedAt: Date,
  now = new Date(),
  staleAfterMinutes = 5,
) {
  if (!activeGenerationStates.has(state)) return false;
  return now.getTime() - updatedAt.getTime() >= staleAfterMinutes * 60_000;
}

export function isOpenDocumentRequestStatus(status: string) {
  return !terminalRequestStatuses.has(status);
}

export function averageDocumentTurnaroundDays(
  rows: readonly { requestedAt: Date; issuedAt?: Date | null; generatedAt?: Date | null }[],
) {
  const completed = rows
    .map((row) => ({ started: row.requestedAt, completed: row.issuedAt ?? row.generatedAt }))
    .filter((row): row is { started: Date; completed: Date } => Boolean(row.completed));
  if (!completed.length) return null;
  const totalDays = completed.reduce(
    (sum, row) => sum + Math.max(0, (row.completed.getTime() - row.started.getTime()) / 86_400_000),
    0,
  );
  return Math.round((totalDays / completed.length) * 10) / 10;
}

export function safeCsvCell(value: unknown) {
  const normalized = value == null
    ? ""
    : value instanceof Date
      ? value.toISOString()
      : String(value);
  const formulaSafe = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}
