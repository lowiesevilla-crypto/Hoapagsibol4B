import type {
  DocumentGenerationMode,
  DocumentGenerationState,
  DocumentOutputFormat,
  DocumentRequestStatus,
} from "@prisma/client";

export type DocumentGenerationIssueSeverity = "INFO" | "WARNING" | "ERROR";

export type DocumentGenerationIssue = {
  code: string;
  domain: "AUTHORIZATION" | "REQUEST" | "DEFINITION" | "POLICY" | "WORKFLOW" | "TEMPLATE" | "PLACEHOLDER" | "RENDERER" | "ISSUANCE" | "RELEASE";
  field?: string;
  severity: DocumentGenerationIssueSeverity;
  blocking: boolean;
  message: string;
  remediation?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type DocumentGenerationOptions = {
  mode: DocumentGenerationMode;
  outputFormat?: DocumentOutputFormat;
  idempotencyKey?: string;
  correlationId?: string;
  draftTemplateVersionId?: string;
  reissueOfVersionId?: string;
  reason?: string;
};

export type DocumentGenerationResult = {
  mode: DocumentGenerationMode;
  state: DocumentGenerationState;
  requestId: string;
  requestStatus: DocumentRequestStatus;
  correlationId: string;
  idempotentReplay: boolean;
  attemptId: string | null;
  documentVersionId: string | null;
  documentNumber: string | null;
  verificationUrl: string | null;
  outputFormat: DocumentOutputFormat;
  contentType: string | null;
  content: string | null;
  contentHash: string | null;
  rendererName: string | null;
  rendererVersion: string | null;
  templateVersionId: string | null;
  templateVersion: number | null;
  issues: DocumentGenerationIssue[];
  warnings: string[];
  policySummary: unknown[];
  workflowSummary: unknown;
};
