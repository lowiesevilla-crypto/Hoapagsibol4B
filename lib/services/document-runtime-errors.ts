export type DocumentRuntimeErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "TENANT_CONTEXT_MISSING"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "CROSS_TENANT"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "INVALID_STATE"
  | "POLICY_BLOCKED"
  | "WORKFLOW_BLOCKED"
  | "DUPLICATE_NUMBER"
  | "VERIFICATION_INVALID"
  | "VERIFICATION_REVOKED"
  | "VERIFICATION_EXPIRED"
  | "CONCURRENCY_CONFLICT";

export class DocumentRuntimeError extends Error {
  constructor(public readonly code: DocumentRuntimeErrorCode, message: string, public readonly details?: unknown) {
    super(message);
    this.name = "DocumentRuntimeError";
  }
}
