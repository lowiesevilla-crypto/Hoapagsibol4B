export const OFFICIAL_APP_URL = "https://hoahub.tech";

export function getAppUrl() {
  const configured = process.env.APP_URL?.trim()
    || process.env.BASE_URL?.trim()
    || process.env.PUBLIC_APP_URL?.trim()
    || (process.env.NODE_ENV === "production" ? OFFICIAL_APP_URL : "http://127.0.0.1:3000");
  try {
    return new URL(configured).origin;
  } catch {
    return process.env.NODE_ENV === "production" ? OFFICIAL_APP_URL : "http://127.0.0.1:3000";
  }
}

export function getApiUrl() {
  const configured = process.env.API_URL?.trim();
  if (!configured) return `${getAppUrl()}/api`;
  try { return new URL(configured).toString().replace(/\/$/, ""); }
  catch { return `${getAppUrl()}/api`; }
}

export function allowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const allowLocalOrigins = process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_ORIGINS === "true";
  return new Set([getAppUrl(), OFFICIAL_APP_URL, ...configured, ...(allowLocalOrigins ? ["http://localhost:3000", "http://127.0.0.1:3000"] : [])]);
}
