export function validateNumberingFormat(format: string) {
  const errors: string[] = [];
  const value = safeText(format).trim();
  if (!value) errors.push("Numbering format is required.");
  if (!/\{SEQUENCE:(4|6)\}/.test(value)) errors.push("Numbering format must include {SEQUENCE:4} or {SEQUENCE:6}.");
  const tokens = Array.from(value.matchAll(/\{([^}]+)\}/g)).map((match) => match[1]);
  const allowed = new Set(["PREFIX", "YYYY", "YY", "MM", "SEQUENCE:4", "SEQUENCE:6"]);
  for (const token of tokens) if (!allowed.has(token)) errors.push(`Unsupported numbering token: {${token}}.`);
  if (/[<>`$\\]/.test(value)) errors.push("Numbering format contains unsupported characters.");
  return { valid: errors.length === 0, errors };
}

export function defaultNumberingFormat(code: string) {
  const prefix = safeText(code).trim().replace(/[^A-Za-z0-9_-]/g, "_").toUpperCase() || "DOC";
  return `${prefix}-{YYYY}-{SEQUENCE:6}`;
}

function safeText(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
