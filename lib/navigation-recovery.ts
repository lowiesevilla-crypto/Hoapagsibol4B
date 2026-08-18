export const GLOBAL_ERROR_RECOVERY_KEY = "hoahub.global-error-recovery.v1";
export const GLOBAL_ERROR_RETRY_WINDOW_MS = 15_000;

const PROTECTED_APPLICATION_PREFIXES = ["/admin", "/platform", "/portal", "/employee"] as const;

export function isProtectedApplicationPath(pathname: string) {
  return PROTECTED_APPLICATION_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function shouldFallbackAfterGlobalError(raw: string | null, pathname: string, now = Date.now()) {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { pathname?: unknown; at?: unknown };
    return parsed.pathname === pathname
      && typeof parsed.at === "number"
      && now - parsed.at >= 0
      && now - parsed.at <= GLOBAL_ERROR_RETRY_WINDOW_MS;
  } catch {
    return false;
  }
}

export function globalErrorRecoveryRecord(pathname: string, now = Date.now()) {
  return JSON.stringify({ pathname, at: now });
}
