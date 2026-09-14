export type AiOperationalErrorCode =
  | "AI_GATEWAY_UNAVAILABLE"
  | "PROVIDER_AUTH_FAILURE"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_QUOTA_FAILURE"
  | "PROVIDER_TIMEOUT"
  | "MODEL_UNAVAILABLE"
  | "INDEX_UNAVAILABLE"
  | "RETRIEVAL_NO_EVIDENCE"
  | "RETRIEVAL_FAILURE"
  | "AUTHORIZATION_DENIED"
  | "TENANT_CONTEXT_FAILURE"
  | "CITATION_FAILURE"
  | "INTERNAL_AI_ERROR";

export class AiOperationalError extends Error {
  readonly code: AiOperationalErrorCode;
  readonly requestId?: string;

  constructor(code: AiOperationalErrorCode, message: string, requestId?: string) {
    super(message);
    this.name = "AiOperationalError";
    this.code = code;
    this.requestId = requestId;
  }
}

export function classifyAiOperationalError(error: unknown): AiOperationalErrorCode {
  if (error instanceof AiOperationalError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  if (/PROVIDER_AUTH_FAILURE|invalid api key|incorrect api key|unauthorized|forbidden/i.test(message)) return "PROVIDER_AUTH_FAILURE";
  if (/PROVIDER_QUOTA_FAILURE|insufficient_quota|quota|billing/i.test(message)) return "PROVIDER_QUOTA_FAILURE";
  if (/PROVIDER_RATE_LIMIT|rate limit|429/i.test(message)) return "PROVIDER_RATE_LIMIT";
  if (/PROVIDER_TIMEOUT|timeout|aborted/i.test(message)) return "PROVIDER_TIMEOUT";
  if (/MODEL_UNAVAILABLE|model.*not found|model.*unavailable/i.test(message)) return "MODEL_UNAVAILABLE";
  if (/INDEX_UNAVAILABLE|vector store.*not found|No tenant AI index/i.test(message)) return "INDEX_UNAVAILABLE";
  if (/RETRIEVAL_FAILURE|retrieval|vector_stores.*search/i.test(message)) return "RETRIEVAL_FAILURE";
  if (/permission|not included|authenticated|TENANT_AI_DISABLED|unavailable:/i.test(message)) return "AUTHORIZATION_DENIED";
  return "INTERNAL_AI_ERROR";
}

export function safeAiUnavailableMessage() {
  return "HOAHub AI is temporarily unavailable. Core HOAHub services remain available.";
}
