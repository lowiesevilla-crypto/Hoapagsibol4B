const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?:\+?63|0)?9\d{9}\b/g;
const LONG_NUMBER = /\b\d{9,19}\b/g;
const SECRET = /\b(?:sk-[A-Za-z0-9_-]{16,}|password\s*[:=]|api[_ -]?key\s*[:=]|secret\s*[:=])\S*/gi;

export function normalizeAiQuestion(value: unknown) {
  const question = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!question) throw new Error("Ask a question before sending it to HOAHub AI.");
  if (question.length > 4000) throw new Error("AI questions are limited to 4,000 characters.");
  return question;
}

/// The first resident release is approved-knowledge Q&A, not personal-record
/// processing. Personal identifiers are therefore unnecessary and rejected
/// before a provider call instead of being silently forwarded.
export function assertKnowledgeQuestionIsMinimized(question: string) {
  if (SECRET.test(question)) throw new Error("Do not include passwords, API keys, or secrets in an AI question.");
  SECRET.lastIndex = 0;
  if (EMAIL.test(question) || PHONE.test(question) || LONG_NUMBER.test(question)) {
    EMAIL.lastIndex = 0;
    PHONE.lastIndex = 0;
    LONG_NUMBER.lastIndex = 0;
    throw new Error("This AI knowledge question appears to contain personal identifiers. Remove account numbers, contact details, or other personal data and try again.");
  }
  EMAIL.lastIndex = 0;
  PHONE.lastIndex = 0;
  LONG_NUMBER.lastIndex = 0;
  return question;
}

export function redactAiContentForAudit(value: string) {
  return value
    .replace(SECRET, "[REDACTED_SECRET]")
    .replace(EMAIL, "[REDACTED_EMAIL]")
    .replace(PHONE, "[REDACTED_PHONE]")
    .replace(LONG_NUMBER, "[REDACTED_IDENTIFIER]")
    .slice(0, 6000);
}
