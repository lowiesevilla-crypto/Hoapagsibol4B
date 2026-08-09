export function safeReturnTo(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "";
  if (raw.includes("\\") || /[\r\n]/.test(raw)) return "";
  try {
    const parsed = new URL(raw, "https://hoahub.invalid");
    if (parsed.origin !== "https://hoahub.invalid") return "";
    if (parsed.pathname === "/login" || parsed.pathname.endsWith("/login")) return "";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "";
  }
}
